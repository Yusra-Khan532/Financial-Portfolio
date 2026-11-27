"""Task #365: export the news-sentiment model to a small int8 ONNX file, so the server scores headlines with onnxruntime alone (no PyTorch, which
would not fit the 2 GB server). Runs at image build time in its own Docker stage (finlit-platform/Dockerfile), never on the server.

Model: mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis (Apache 2.0; DistilRoBERTa, 82M parameters, labels negative / neutral /
positive). Chosen over ProsusAI/finbert, whose CC BY-NC-SA 4.0 licence does not allow commercial use (decision of 24 Nov 2026, task #365).
The revision is pinned so a rebuild never changes the model under the stored scores.

Usage: python export_sentiment_model.py OUT_DIR
Writes OUT_DIR/model.onnx (int8), OUT_DIR/tokenizer.json and OUT_DIR/meta.json (labels, revision, version tag)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

MODEL_ID = "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"
REVISION = "ae0eab9ad336d7d548e0efe394b07c04bcaf6e91"
VERSION = "fin-distilroberta-int8-v1"


def main(out: str) -> None:
    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    dst = Path(out)
    dst.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID, revision=REVISION).eval()
    enc = tok(["Operating profit rose to Rs 120 crore."], return_tensors="pt", padding=True, truncation=True, max_length=128)
    fp32 = dst / "model.fp32.onnx"
    with torch.no_grad():
        torch.onnx.export(model, (enc["input_ids"], enc["attention_mask"]), str(fp32), input_names=["input_ids", "attention_mask"],
                          output_names=["logits"], dynamic_axes={"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, "logits": {0: "b"}},
                          opset_version=17, do_constant_folding=True)
    quantize_dynamic(str(fp32), str(dst / "model.onnx"), weight_type=QuantType.QInt8)
    fp32.unlink()
    tok.backend_tokenizer.save(str(dst / "tokenizer.json"))
    labels = [model.config.id2label[i] for i in range(model.config.num_labels)]
    (dst / "meta.json").write_text(json.dumps({"model": MODEL_ID, "revision": REVISION, "version": VERSION, "labels": labels, "licence": "apache-2.0"}))
    print("exported", VERSION, labels, (dst / "model.onnx").stat().st_size)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "models/sentiment")
