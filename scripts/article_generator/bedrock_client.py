"""AWS Bedrock クライアント（Phase 2 リファクタリングで app.py から分離）。"""
import json
import os


# ─── AWS Bedrock ──────────────────────────────────────────────────────────────

def get_bedrock_client():
    import boto3
    return boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def invoke_claude(prompt: str, max_tokens: int = 8000) -> str:
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
    client = get_bedrock_client()
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = client.invoke_model(
        modelId=model_id,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    return json.loads(resp["body"].read())["content"][0]["text"]


def invoke_claude_stream(prompt: str, on_chunk, max_tokens: int = 8000) -> str:
    """Bedrock のレスポンスストリーミングで本文を生成し、
    テキスト断片が届くたびに on_chunk(delta_text) を呼ぶ。完成テキストを返す。

    リアルタイムの「生成中」プレビュー用。ストリーミング非対応エラー時は
    通常の invoke_claude にフォールバックする。
    """
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
    client = get_bedrock_client()
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        resp = client.invoke_model_with_response_stream(
            modelId=model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
    except Exception:
        full = invoke_claude(prompt, max_tokens=max_tokens)
        if on_chunk:
            on_chunk(full)
        return full

    parts: list[str] = []
    for event in resp["body"]:
        chunk = event.get("chunk")
        if not chunk:
            continue
        data = json.loads(chunk["bytes"].decode("utf-8"))
        if data.get("type") == "content_block_delta":
            text = data.get("delta", {}).get("text", "")
            if text:
                parts.append(text)
                if on_chunk:
                    on_chunk(text)
    return "".join(parts)
