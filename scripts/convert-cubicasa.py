#!/usr/bin/env python3
"""
Download + convert the CubiCasa5k floor-plan model to ONNX (one-time, LOCAL only).

CubiCasa5k weights are CC-BY-NC (personal/research use). This downloads them and
the published model code, exports an ONNX graph, and writes it to the GITIGNORED
asset-cache/models/cubicasa5k.onnx. Nothing here is committed — the booster picks
the model up automatically once it exists (see lib/extraction/cubicasa/README.md).

Run:  python3 scripts/convert-cubicasa.py        (or: npm run convert:cubicasa)

Heavy: installs torch + onnx + gdown if missing, clones the CubiCasa5k repo for
the model architecture, and downloads a ~200 MB checkpoint from Google Drive.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "asset-cache", "cubicasa")
REPO = os.path.join(WORK, "CubiCasa5k")
WEIGHTS = os.path.join(WORK, "model_best_val_loss_var.pkl")
OUT = os.path.join(ROOT, "asset-cache", "models", "cubicasa5k.onnx")

# Official sources (see github.com/CubiCasa/CubiCasa5k).
REPO_URL = "https://github.com/CubiCasa/CubiCasa5k"
WEIGHTS_GDRIVE_ID = "1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK"


def pip_install(*pkgs):
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", *pkgs])


def ensure(mod, *pkgs):
    try:
        return __import__(mod)
    except ImportError:
        print(f"… installing {' '.join(pkgs or (mod,))}")
        pip_install(*(pkgs or (mod,)))
        return __import__(mod)


def main():
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    torch = ensure("torch")
    ensure("onnx")

    # Model architecture — clone the published repo (we use it, never vendor it).
    if not os.path.isdir(REPO):
        print("… cloning CubiCasa5k model code")
        subprocess.check_call(["git", "clone", "--depth", "1", REPO_URL, REPO])
    sys.path.insert(0, REPO)

    # Weights (Google Drive, CC-BY-NC).
    if not os.path.exists(WEIGHTS):
        gdown = ensure("gdown")
        print("… downloading weights (~200 MB)")
        gdown.download(id=WEIGHTS_GDRIVE_ID, output=WEIGHTS, quiet=False)

    # Build the model exactly as the repo's eval.py does (44 outputs = 21 heatmaps
    # + 12 rooms + 11 icons) and load the checkpoint.
    import torch.nn as nn
    # Build the architecture directly instead of via get_model(): get_model()
    # also calls model.init_weights(), which loads an MPII backbone-pretraining
    # file (floortrans/models/model_1427.pth) the repo never ships — and we don't
    # need it, because the full trained checkpoint loaded below overwrites every
    # weight anyway. Importing the class skips that dead (crashing) init step.
    from floortrans.models.hg_furukawa_original import hg_furukawa_original

    n_classes = 44
    model = hg_furukawa_original(n_classes=51)
    model.conv4_ = nn.Conv2d(256, n_classes, bias=True, kernel_size=1)
    model.upsample = nn.ConvTranspose2d(n_classes, n_classes, kernel_size=4, stride=4)
    checkpoint = torch.load(WEIGHTS, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    print("… exporting ONNX")
    dummy = torch.randn(1, 3, 512, 512)
    torch.onnx.export(
        model,
        dummy,
        OUT,
        opset_version=11,
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "n", 2: "h", 3: "w"}, "logits": {0: "n", 2: "h", 3: "w"}},
    )
    size_mb = os.path.getsize(OUT) / 1e6
    print(f"CUBICASA_ONNX_OK {OUT} ({size_mb:.0f} MB)")
    print("The booster is now enabled — restart the sidecar to pick it up.")


if __name__ == "__main__":
    main()
