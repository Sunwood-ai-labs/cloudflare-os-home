"""Apply model-aware Mantle tool filtering for LiteLLM v1.93.0."""

from pathlib import Path

import litellm


target = (
    Path(litellm.__file__).resolve().parent
    / "llms"
    / "bedrock_mantle"
    / "responses"
    / "transformation.py"
)

source = target.read_text(encoding="utf-8")

replacements = [
    (
        "from typing import Any, Dict, List, Optional",
        "import json\n\n"
        "import httpx\n\n"
        "from typing import Any, Dict, List, Optional",
    ),
    (
        '_BEDROCK_MANTLE_SUPPORTED_RESPONSE_TOOL_TYPES = '
        'frozenset({"function", "mcp", "custom", "namespace", "tool_search"})',
        '_BEDROCK_MANTLE_SUPPORTED_RESPONSE_TOOL_TYPES = '
        'frozenset({"function", "mcp", "custom", "namespace", "tool_search"})\n'
        '_BEDROCK_MANTLE_GPT_OSS_SUPPORTED_RESPONSE_TOOL_TYPES = '
        'frozenset({"function", "mcp"})',
    ),
    (
        "def _filter_unsupported_tools(tools: List[Any]) -> List[Any]:",
        "def _filter_unsupported_tools(\n"
        "        tools: List[Any], supported_tool_types: frozenset[str]\n"
        "    ) -> List[Any]:",
    ),
    (
        "if tool_type in _BEDROCK_MANTLE_SUPPORTED_RESPONSE_TOOL_TYPES:",
        "if tool_type in supported_tool_types:",
    ),
    (
        "sorted(_BEDROCK_MANTLE_SUPPORTED_RESPONSE_TOOL_TYPES),",
        "sorted(supported_tool_types),",
    ),
    (
        "filtered = self._filter_unsupported_tools(tools_list)",
        "supported_tool_types = (\n"
        "            _BEDROCK_MANTLE_GPT_OSS_SUPPORTED_RESPONSE_TOOL_TYPES\n"
        '            if model.startswith("openai.gpt-oss")\n'
        "            else _BEDROCK_MANTLE_SUPPORTED_RESPONSE_TOOL_TYPES\n"
        "        )\n"
        "        filtered = self._filter_unsupported_tools(\n"
        "            tools_list, supported_tool_types\n"
        "        )",
    ),
    (
        "    def map_openai_params(\n",
        "    @staticmethod\n"
        "    def _restore_codex_collaboration_namespace(\n"
        "        model: str, payload: Dict[str, Any]\n"
        "    ) -> Dict[str, Any]:\n"
        '        """Restore namespace metadata omitted by Grok 4.3 on Mantle."""\n'
        '        if model != "xai.grok-4.3":\n'
        "            return payload\n"
        "\n"
        "        collaboration_calls = {\n"
        '            "spawn_agent",\n'
        '            "send_message",\n'
        '            "followup_task",\n'
        '            "wait_agent",\n'
        '            "interrupt_agent",\n'
        '            "list_agents",\n'
        "        }\n"
        "\n"
        "        def patch_item(item: Any) -> None:\n"
        "            if not isinstance(item, dict):\n"
        "                return\n"
        '            if item.get("type") != "function_call":\n'
        "                return\n"
        '            if item.get("name") not in collaboration_calls:\n'
        "                return\n"
        '            item.setdefault("namespace", "collaboration")\n'
        "\n"
        '        patch_item(payload.get("item"))\n'
        '        for item in payload.get("output", []):\n'
        "            patch_item(item)\n"
        '        response = payload.get("response")\n'
        "        if isinstance(response, dict):\n"
        '            for item in response.get("output", []):\n'
        "                patch_item(item)\n"
        "        return payload\n"
        "\n"
        "    def transform_response_api_response(\n"
        "        self, model: str, raw_response: httpx.Response, logging_obj: Any\n"
        "    ) -> Any:\n"
        "        payload = self._restore_codex_collaboration_namespace(\n"
        "            model, raw_response.json()\n"
        "        )\n"
        "        patched_response = httpx.Response(\n"
        "            status_code=raw_response.status_code,\n"
        "            headers=raw_response.headers,\n"
        '            content=json.dumps(payload).encode("utf-8"),\n'
        "            request=raw_response.request,\n"
        "        )\n"
        "        return super().transform_response_api_response(\n"
        "            model=model,\n"
        "            raw_response=patched_response,\n"
        "            logging_obj=logging_obj,\n"
        "        )\n"
        "\n"
        "    def transform_streaming_response(\n"
        "        self, model: str, parsed_chunk: dict, logging_obj: Any\n"
        "    ) -> Any:\n"
        "        parsed_chunk = self._restore_codex_collaboration_namespace(\n"
        "            model, parsed_chunk\n"
        "        )\n"
        "        return super().transform_streaming_response(\n"
        "            model=model,\n"
        "            parsed_chunk=parsed_chunk,\n"
        "            logging_obj=logging_obj,\n"
        "        )\n"
        "\n"
        "    def map_openai_params(\n",
    ),
]

for old, new in replacements:
    if old not in source:
        raise SystemExit(f"Expected LiteLLM source fragment not found in {target}: {old}")
    source = source.replace(old, new, 1)

target.write_text(source, encoding="utf-8")
print(f"Patched Mantle tool compatibility: {target}")
