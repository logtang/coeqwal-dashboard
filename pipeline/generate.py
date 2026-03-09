#!/usr/bin/env python3
"""
Policy Analysis Pipeline — Generation Script
=============================================
Reads a static outcome config, builds a structured prompt, calls the OpenAI
API with JSON mode, validates the response against the canonical schema, and
writes the result to chatgpt_responses/{metric}.json.

Usage:
    python pipeline/generate.py --metric agricultural_productivity
    python pipeline/generate.py --metric agricultural_productivity --dry-run
    python pipeline/generate.py --metric agricultural_productivity --out path/to/custom.json

Environment variables:
    OPENAI_API_KEY   Required unless --dry-run is set.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------

try:
    import openai
except ImportError:
    sys.exit(
        "openai package not found.\n"
        "Run: pip install openai --break-system-packages"
    )

try:
    import jsonschema
    from jsonschema import validate as jsonschema_validate, ValidationError
except ImportError:
    sys.exit(
        "jsonschema package not found.\n"
        "Run: pip install jsonschema --break-system-packages"
    )


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT    = PIPELINE_DIR.parent
CONFIG_DIR   = PIPELINE_DIR / "config"
SCHEMA_PATH  = PIPELINE_DIR / "schema" / "output_schema.json"
PROMPT_PATH  = PIPELINE_DIR / "prompts" / "base_prompt.txt"
OUTPUT_DIR   = REPO_ROOT / "chatgpt_responses"


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_text(path: Path) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def build_prompt(config: dict, template: str) -> str:
    """Substitute config values into the prompt template."""
    outcome   = config["outcome"]
    tiers     = config["tiers"]
    standards = config["legal_standards"]["standards"]

    tiers_block = "\n".join(
        f"  - {t['tier_label']}: {t['threshold']}"
        for t in tiers
    )

    standards_block = "\n\n".join(
        (
            f"  ID:       {s['legal_standard_id']}\n"
            f"  Title:    {s['title']}\n"
            f"  Citation: {s['citation']}\n"
            f"  Scope:    {s['scope_note']}"
        )
        for s in standards
    )

    return (
        template
        .replace("{{OUTCOME_NAME}}",              outcome["name"])
        .replace("{{OUTCOME_DEFINITION}}",        outcome["definition"])
        .replace("{{TIER_INTERPRETATION_NOTE}}",  outcome["tier_interpretation_note"])
        .replace("{{TIERS_BLOCK}}",               tiers_block)
        .replace("{{STANDARDS_BLOCK}}",           standards_block)
        .replace("{{OUTCOME_DOMAIN_LABEL}}",      outcome["domain_label"])
    )


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

def sort_policies_direct_first(output: dict) -> dict:
    """Within each tier, place 'direct' entries before 'indirect' entries.
    Preserves original order within each group (stable sort)."""
    for tier_val in output.get("Tiers", {}).values():
        policies = tier_val.get("policies", [])
        tier_val["policies"] = sorted(
            policies,
            key=lambda p: (0 if p.get("effect_type") == "direct" else 1)
        )
    return output


def inject_meta(output: dict, config: dict) -> dict:
    """Stamp pipeline metadata into the meta block."""
    output.setdefault("meta", {})
    output["meta"]["generated_at"]  = datetime.now(timezone.utc).isoformat()
    output["meta"]["config_version"] = config.get("_version", "1.0.0")
    return output


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_schema(output: dict, schema: dict) -> list[str]:
    """Return a list of schema validation error messages, empty if valid."""
    errors = []
    validator = jsonschema.Draft7Validator(schema)
    for error in sorted(validator.iter_errors(output), key=lambda e: list(e.absolute_path)):
        path = " > ".join(str(p) for p in error.absolute_path) or "(root)"
        errors.append(f"  [{path}] {error.message}")
    return errors


def check_id_consistency(output: dict, config: dict) -> list[str]:
    """Return warnings for any legal_standard_id referenced in Tiers or
    Governing Agencies that is not defined in the Legal Standards array,
    or that uses a deprecated alias instead of a canonical ID."""
    defined_ids  = {s["legal_standard_id"] for s in output.get("Legal Standards", [])}
    canonical    = {s["legal_standard_id"] for s in config["legal_standards"]["standards"]}
    aliases      = config["legal_standards"].get("deprecated_aliases", {})
    deprecated   = {k: v for k, v in aliases.items() if not k.startswith("_")}

    warnings = []

    for tier_label, tier in output.get("Tiers", {}).items():
        for policy in tier.get("policies", []):
            pid = policy.get("legal_standard_id", "")
            if pid in deprecated:
                warnings.append(
                    f"  {tier_label} policy '{policy.get('policy_name', '?')}': "
                    f"'{pid}' is a deprecated alias — {deprecated[pid]}"
                )
            elif pid not in defined_ids:
                warnings.append(
                    f"  {tier_label} policy '{policy.get('policy_name', '?')}': "
                    f"'{pid}' not found in Legal Standards array"
                )
            elif pid not in canonical:
                warnings.append(
                    f"  {tier_label} policy '{policy.get('policy_name', '?')}': "
                    f"'{pid}' not in canonical config IDs"
                )

    for agency in output.get("Governing Agencies", []):
        for pid in agency.get("pertains_to_legal_standards", []):
            if pid in deprecated:
                warnings.append(
                    f"  Agency '{agency['name']}': '{pid}' is a deprecated alias — {deprecated[pid]}"
                )
            elif pid not in defined_ids:
                warnings.append(
                    f"  Agency '{agency['name']}': '{pid}' not found in Legal Standards array"
                )

    return warnings


def check_relationship_consistency(output: dict) -> list[str]:
    """Return warnings where effect_type and relationship are mismatched."""
    EXPECTED = {"direct": "Direct", "indirect": "Indirect"}
    warnings = []
    for tier_label, tier in output.get("Tiers", {}).items():
        for policy in tier.get("policies", []):
            et  = policy.get("effect_type")
            rel = policy.get("relationship")
            if et in EXPECTED and rel != EXPECTED[et]:
                warnings.append(
                    f"  {tier_label} '{policy.get('policy_name', '?')}': "
                    f"effect_type='{et}' but relationship='{rel}' (expected '{EXPECTED[et]}')"
                )
    return warnings


# ---------------------------------------------------------------------------
# API call
# ---------------------------------------------------------------------------

def call_openai(prompt: str, model: str, api_key: str) -> str:
    """Call the OpenAI chat completions endpoint with JSON mode.
    Returns the raw response string."""
    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a California water policy analyst. "
                    "You respond only with valid JSON that exactly matches the provided schema. "
                    "Do not include any explanation, commentary, or markdown — only the JSON object."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )
    return response.choices[0].message.content


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a policy analysis JSON for one outcome domain."
    )
    parser.add_argument(
        "--metric", required=True,
        help="Outcome domain ID matching a config file, e.g. agricultural_productivity"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the constructed prompt and exit without calling the API"
    )
    parser.add_argument(
        "--model", default="gpt-4o",
        help="OpenAI model to use (default: gpt-4o)"
    )
    parser.add_argument(
        "--out", default=None,
        help="Override output path (default: chatgpt_responses/{metric}.json)"
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------ Load
    config_path = CONFIG_DIR / f"{args.metric}.config.json"
    if not config_path.exists():
        sys.exit(f"Config not found: {config_path}\nAvailable configs: {list(CONFIG_DIR.glob('*.config.json'))}")

    print(f"Loading config:  {config_path}")
    config = load_json(config_path)

    print(f"Loading schema:  {SCHEMA_PATH}")
    schema = load_json(SCHEMA_PATH)

    print(f"Loading prompt:  {PROMPT_PATH}")
    template = load_text(PROMPT_PATH)

    # ------------------------------------------------------ Build prompt
    prompt = build_prompt(config, template)

    if args.dry_run:
        print("\n" + "=" * 72)
        print("DRY RUN — constructed prompt (no API call)")
        print("=" * 72 + "\n")
        print(prompt)
        return

    # ------------------------------------------------------ API call
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit(
            "OPENAI_API_KEY environment variable is not set.\n"
            "Export it before running: export OPENAI_API_KEY=sk-..."
        )

    print(f"\nCalling {args.model} for metric '{args.metric}' ...")
    raw = call_openai(prompt, args.model, api_key)

    # ------------------------------------------------------ Parse
    try:
        output = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.exit(
            f"Model returned invalid JSON: {e}\n\n"
            f"First 500 chars of raw output:\n{raw[:500]}"
        )

    # ------------------------------------------------------ Post-process
    output = sort_policies_direct_first(output)
    output = inject_meta(output, config)

    # ------------------------------------------------------ Validate
    print("\nValidating output ...")

    schema_errors = validate_schema(output, schema)
    if schema_errors:
        print(f"  Schema validation: FAILED ({len(schema_errors)} error(s))")
        for e in schema_errors:
            print(e)
        sys.exit(1)
    print("  Schema validation:       PASSED")

    id_warnings = check_id_consistency(output, config)
    if id_warnings:
        print(f"  ID consistency:          {len(id_warnings)} warning(s)")
        for w in id_warnings:
            print(w)
    else:
        print("  ID consistency:          PASSED")

    rel_warnings = check_relationship_consistency(output)
    if rel_warnings:
        print(f"  effect_type/relationship: {len(rel_warnings)} mismatch(es)")
        for w in rel_warnings:
            print(w)
    else:
        print("  effect_type/relationship: PASSED")

    # ------------------------------------------------------ Write
    out_path = Path(args.out) if args.out else OUTPUT_DIR / f"{args.metric}.json"
    write_json(out_path, output)
    print(f"\nOutput written → {out_path}")


if __name__ == "__main__":
    main()
