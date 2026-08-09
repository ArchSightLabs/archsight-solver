import json

from backend.runtime_resources import (
    PACKAGED_RESOURCE_FILES,
    packaged_resource_path,
    runtime_resource_path,
)


def test_packaged_runtime_resources_match_repository_sources():
    repository_root = runtime_resource_path(".").resolve()

    for relative_path in PACKAGED_RESOURCE_FILES:
        source = repository_root / relative_path
        packaged = packaged_resource_path(relative_path)

        assert source.is_file(), f"缺少仓库资源: {relative_path}"
        assert packaged.is_file(), f"缺少 wheel 资源副本: {relative_path}"
        assert packaged.read_bytes() == source.read_bytes(), f"wheel 资源副本未同步: {relative_path}"


def test_runtime_resource_path_falls_back_to_packaged_copy_outside_repository(tmp_path):
    for relative_path in PACKAGED_RESOURCE_FILES:
        resolved = runtime_resource_path(relative_path, repository_root=tmp_path)

        assert resolved == packaged_resource_path(relative_path)
        assert resolved.is_file()


def test_packaged_json_resources_are_valid_json():
    for relative_path in PACKAGED_RESOURCE_FILES:
        if relative_path.endswith(".json"):
            json.loads(packaged_resource_path(relative_path).read_text(encoding="utf-8"))
