"""
HomeCanvas — headless Blender Cycles render adapter (the "quality ceiling").

Builds geometry directly from an exported HomeScene JSON (no glTF round-trip):
walls as extruded prisms along their centerlines, room floors as filled polygons,
and procedural furniture rebuilt from the same parametric primitives the in-app
renderer uses — then sets up Cycles + AgX + an HDRI world + a sun + an auto-framed
camera and writes a PNG. Self-contained so the sidecar can drive it with just the
scene file; no Blender add-on required.

Invoke (the sidecar does this):
  blender -b -P scripts/render-blender.py -- \
      --scene scene.json --out render.png [--hdri env.hdr] [--samples 128] \
      [--res 1280x800] [--gpu]

Tested against Blender 5.1. Units: scene is mm; Blender is m (scale 0.001).
"""
import bpy
import sys
import os
import json
import math
import mathutils

MM = 0.001


def arg(flag, default=None):
    argv = sys.argv
    rest = argv[argv.index("--") + 1:] if "--" in argv else []
    return rest[rest.index(flag) + 1] if flag in rest else default


def has_flag(flag):
    argv = sys.argv
    rest = argv[argv.index("--") + 1:] if "--" in argv else []
    return flag in rest


def hex_to_rgb(h):
    h = (h or "#cccccc").lstrip("#")
    if len(h) != 6:
        h = "cccccc"
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# Procedural furniture — a faithful port of ProceduralFurniture.pieces() so the
# Cycles render matches the interactive scene. Each piece is (kind, pos[x,y,z],
# size, material-slot). Local space: x=width, y=depth, z=up (metres).
# Material slots: >=0 -> object.materialIds[slot]; -1 dark; -2 foliage.
# ---------------------------------------------------------------------------
def furniture_pieces(kind, w, d, h):
    if kind == "sofa":
        seat_h = h * 0.5
        arm_w = w * 0.1
        return [
            ("box", (0, 0, seat_h / 2), (w - 2 * arm_w, d, seat_h), 0),
            ("box", (0, -d * 0.38, h * 0.55), (w - 2 * arm_w, d * 0.24, h * 0.9 - seat_h), 0),
            ("box", (-(w / 2 - arm_w / 2), 0, h * 0.35), (arm_w, d, h * 0.7), 1),
            ("box", (w / 2 - arm_w / 2, 0, h * 0.35), (arm_w, d, h * 0.7), 1),
        ]
    if kind == "bed":
        base_h = h * 0.45
        return [
            ("box", (0, 0, base_h / 2), (w, d, base_h), 1),
            ("box", (0, 0, base_h + h * 0.12), (w * 0.96, d * 0.96, h * 0.24), 0),
            ("box", (0, -d / 2 + 0.04, h * 0.75), (w, 0.08, h * 1.5 - base_h), 1),
        ]
    if kind in ("table", "diningTable"):
        leg_r = 0.035
        top_t = 0.05
        lx = w / 2 - 0.08
        lz = d / 2 - 0.08
        return [
            ("box", (0, 0, h - top_t / 2), (w, d, top_t), 0),
            ("cyl", (-lx, -lz, (h - top_t) / 2), (leg_r, h - top_t), 0),
            ("cyl", (lx, -lz, (h - top_t) / 2), (leg_r, h - top_t), 0),
            ("cyl", (-lx, lz, (h - top_t) / 2), (leg_r, h - top_t), 0),
            ("cyl", (lx, lz, (h - top_t) / 2), (leg_r, h - top_t), 0),
        ]
    if kind == "wardrobe":
        return [
            ("box", (0, 0, h / 2), (w, d, h), 0),
            ("box", (0, d / 2 + 0.005, h * 0.55), (0.02, 0.015, h * 0.25), 1),
        ]
    if kind == "tvUnit":
        return [
            ("box", (0, 0, h / 2), (w, d, h), 0),
            ("box", (0, 0, h + 0.45), (w * 0.62, 0.04, 0.7), -1),
        ]
    if kind == "plant":
        return [
            ("cyl", (0, 0, h * 0.15), (w * 0.4, h * 0.3), 0),
            ("cyl", (0, 0, h * 0.6), (w * 0.55, h * 0.6), -2),
        ]
    if kind == "chair":
        return [
            ("box", (0, 0, h * 0.3), (w, d, h * 0.12), 0),
            ("box", (0, -d * 0.4, h * 0.62), (w, d * 0.16, h * 0.65), 0),
        ]
    if kind == "rug":
        return [("box", (0, 0, h / 2), (w, d, h), 0)]
    # default: a simple block
    return [("box", (0, 0, h / 2), (w, d, h), 0)]


def main():
    scene_path = arg("--scene")
    out_path = arg("--out", "/tmp/homecanvas-render.png")
    hdri_path = arg("--hdri")
    samples = int(arg("--samples", "128"))
    res = arg("--res", "1280x800")
    use_gpu = has_flag("--gpu")
    rx, ry = (int(x) for x in res.split("x"))

    with open(scene_path) as f:
        doc = json.load(f)

    # --- fresh scene ---
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)

    # --- materials (Principled BSDF from baseColor) ---
    by_id = {m["id"]: m for m in doc.get("materials", [])}
    mat_cache = {}
    dark = None
    foliage = None

    def make_mat(name, base_hex, rough=0.7):
        bm = bpy.data.materials.new(name)
        bm.use_nodes = True
        bsdf = bm.node_tree.nodes.get("Principled BSDF")
        r, g, b = hex_to_rgb(base_hex)
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = rough
        return bm

    def mat_for(mid, fallback="#cccccc"):
        key = mid or fallback
        if key not in mat_cache:
            base = by_id.get(mid, {}).get("baseColor", fallback)
            mat_cache[key] = make_mat(mid or "mat", base)
        return mat_cache[key]

    def slot_mat(slot, material_ids):
        nonlocal dark, foliage
        if slot == -1:
            if dark is None:
                dark = make_mat("dark", "#26241f", 0.6)
            return dark
        if slot == -2:
            if foliage is None:
                foliage = make_mat("foliage", "#3f6b3f", 0.9)
            return foliage
        mid = material_ids[slot] if slot < len(material_ids) else (material_ids[0] if material_ids else None)
        return mat_for(mid, "#b6a48c")

    def link(obj, material):
        obj.data.materials.append(material)

    # --- geometry per floor ---
    for fi, floor in enumerate(doc.get("floors", [])):
        z0 = fi * 3.2  # stack levels

        for room in floor.get("rooms", []):
            outer = room["boundary"]["outer"]
            verts = [(p["x"] * MM, p["y"] * MM, z0) for p in outer]
            if len(verts) < 3:
                continue
            mesh = bpy.data.meshes.new(room["id"] + "_floor")
            mesh.from_pydata(verts, [], [list(range(len(verts)))])
            mesh.update()
            obj = bpy.data.objects.new(room["id"] + "_floor", mesh)
            bpy.context.collection.objects.link(obj)
            link(obj, mat_for((room.get("floorSurface") or {}).get("materialId"), "#cbb89c"))

        for wall in floor.get("walls", []):
            pts = wall["path"]["pts"]
            th = wall.get("thickness", 150) * MM
            h = wall.get("height", 2700) * MM
            wmat = mat_for((wall.get("materialIds") or {}).get("sideA"), "#e7e3dc")
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                ax, ay, bx, by = a["x"] * MM, a["y"] * MM, b["x"] * MM, b["y"] * MM
                length = math.hypot(bx - ax, by - ay)
                if length < 1e-4:
                    continue
                bpy.ops.mesh.primitive_cube_add(size=1, location=((ax + bx) / 2, (ay + by) / 2, z0 + h / 2))
                cube = bpy.context.active_object
                cube.scale = (length, th, h)
                cube.rotation_euler = (0, 0, math.atan2(by - ay, bx - ax))
                link(cube, wmat)

        for o in floor.get("objects", []):
            dim = o["dimensions"]
            w, d, h = dim["w"] * MM, dim["d"] * MM, dim["h"] * MM
            t = o["transform"]
            kind = (o.get("procedural") or {}).get("kind") or o.get("category") or "box"
            material_ids = o.get("materialIds") or []
            ox, oy, oz = t["x"] * MM, t["y"] * MM, z0 + t.get("elevation", 0) * MM
            rot = t.get("rotationY", 0)
            cos_r, sin_r = math.cos(rot), math.sin(rot)
            for ptype, pos, size, slot in furniture_pieces(kind, w, d, h):
                # rotate the local piece offset around z, then translate to the object origin
                lx, ly, lz = pos
                wx = ox + lx * cos_r - ly * sin_r
                wy = oy + lx * sin_r + ly * cos_r
                wz = oz + lz
                if ptype == "box":
                    bpy.ops.mesh.primitive_cube_add(size=1, location=(wx, wy, wz))
                    piece = bpy.context.active_object
                    piece.scale = (size[0], size[1], size[2])
                else:  # cylinder: size = (radius, height)
                    bpy.ops.mesh.primitive_cylinder_add(radius=size[0], depth=size[1], vertices=20, location=(wx, wy, wz))
                    piece = bpy.context.active_object
                piece.rotation_euler = (0, 0, rot)
                link(piece, slot_mat(slot, material_ids))

    # --- world / HDRI ---
    world = bpy.data.worlds.new("HomeCanvasWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if hdri_path and os.path.exists(hdri_path):
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri_path)
        world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.62, 0.65, 0.70, 1.0)
        bg.inputs["Strength"].default_value = 1.1

    # --- key sun ---
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.5
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(20), math.radians(40))
    bpy.context.collection.objects.link(sun)

    # --- auto-framed camera (3/4 view of the scene bounds) ---
    big = 1e9
    minv = mathutils.Vector((big, big, big))
    maxv = mathutils.Vector((-big, -big, -big))
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for corner in obj.bound_box:
                wv = obj.matrix_world @ mathutils.Vector(corner)
                minv = mathutils.Vector((min(minv.x, wv.x), min(minv.y, wv.y), min(minv.z, wv.z)))
                maxv = mathutils.Vector((max(maxv.x, wv.x), max(maxv.y, wv.y), max(maxv.z, wv.z)))
    center = (minv + maxv) / 2
    span = max((maxv - minv).length, 1.0)
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (center.x + span * 0.45, center.y - span * 0.6, center.z + span * 0.55)
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    # --- render config: Cycles + AgX ---
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    try:
        sc.cycles.use_denoising = True
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = "AgX"
    except Exception:
        pass
    sc.render.resolution_x = rx
    sc.render.resolution_y = ry
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = out_path

    if use_gpu:
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for dev_type in ("METAL", "CUDA", "OPTIX", "HIP"):
                try:
                    prefs.compute_device_type = dev_type
                    prefs.get_devices()
                    if any(d.type == dev_type for d in prefs.devices):
                        break
                except Exception:
                    continue
            for dev in prefs.devices:
                dev.use = True
            sc.cycles.device = "GPU"
        except Exception as e:
            print("HOMECANVAS: GPU setup skipped (%s) — rendering on CPU" % e)

    bpy.ops.render.render(write_still=True)
    print("HOMECANVAS_RENDER_OK", out_path)


if __name__ == "__main__":
    main()
