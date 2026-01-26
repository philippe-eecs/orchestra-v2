"""Unit tests for runner functions."""

import pytest
import sys
sys.path.insert(0, '..')

from services.runner import topo_sort, build_prompt, extract_artifacts, get_parent_outputs


# Mock Node and Edge classes for testing
class MockNode:
    def __init__(self, id):
        self.id = id

class MockEdge:
    def __init__(self, parent_id, child_id):
        self.parent_id = parent_id
        self.child_id = child_id


class TestTopoSort:
    def test_linear_chain(self):
        """A -> B -> C should return [A, B, C]"""
        nodes = [MockNode(1), MockNode(2), MockNode(3)]
        edges = [MockEdge(1, 2), MockEdge(2, 3)]
        result = topo_sort(nodes, edges)
        assert result == [1, 2, 3]

    def test_multiple_roots(self):
        """A -> C, B -> C should have A,B before C"""
        nodes = [MockNode(1), MockNode(2), MockNode(3)]
        edges = [MockEdge(1, 3), MockEdge(2, 3)]
        result = topo_sort(nodes, edges)
        assert result[-1] == 3
        assert set(result[:2]) == {1, 2}

    def test_single_node(self):
        """Single node with no edges"""
        nodes = [MockNode(1)]
        edges = []
        result = topo_sort(nodes, edges)
        assert result == [1]

    def test_diamond(self):
        """A -> B, A -> C, B -> D, C -> D"""
        nodes = [MockNode(1), MockNode(2), MockNode(3), MockNode(4)]
        edges = [MockEdge(1, 2), MockEdge(1, 3), MockEdge(2, 4), MockEdge(3, 4)]
        result = topo_sort(nodes, edges)
        assert result[0] == 1
        assert result[-1] == 4
        assert set(result[1:3]) == {2, 3}

    def test_cycle_detection(self):
        """A -> B -> C -> A should raise ValueError"""
        nodes = [MockNode(1), MockNode(2), MockNode(3)]
        edges = [MockEdge(1, 2), MockEdge(2, 3), MockEdge(3, 1)]
        with pytest.raises(ValueError, match="cycle"):
            topo_sort(nodes, edges)

    def test_self_loop(self):
        """A -> A should raise ValueError"""
        nodes = [MockNode(1)]
        edges = [MockEdge(1, 1)]
        with pytest.raises(ValueError, match="cycle"):
            topo_sort(nodes, edges)


class TestBuildPrompt:
    def test_no_context(self):
        """Without context, return prompt as-is"""
        result = build_prompt("Do something", "")
        assert result == "Do something"

    def test_with_context(self):
        """With context, format properly"""
        result = build_prompt("Do something", "Previous output")
        assert "Context from previous steps" in result
        assert "Previous output" in result
        assert "Your task" in result
        assert "Do something" in result

    def test_multiline_context(self):
        """Context with multiple lines preserved"""
        context = "Line 1\n\n---\n\nLine 2"
        result = build_prompt("Task", context)
        assert "Line 1" in result
        assert "Line 2" in result


class TestExtractArtifacts:
    def test_github_pr_url(self):
        """Extract GitHub PR URLs"""
        output = "Created PR: https://github.com/user/repo/pull/123"
        result = extract_artifacts(output)
        prs = [a for a in result if a["type"] == "pr"]
        assert len(prs) == 1
        assert prs[0]["url"] == "https://github.com/user/repo/pull/123"

    def test_github_url(self):
        """Extract general GitHub URLs"""
        output = "See https://github.com/user/repo/blob/main/file.py"
        result = extract_artifacts(output)
        gh = [a for a in result if a["type"] == "github"]
        assert len(gh) >= 1

    def test_generic_url(self):
        """Extract generic URLs"""
        output = "Documentation at https://docs.example.com/api"
        result = extract_artifacts(output)
        urls = [a for a in result if a["type"] == "url"]
        assert any("docs.example.com" in u["url"] for u in urls)

    def test_file_path(self):
        """Extract file paths from common patterns"""
        output = "Created src/main.py with the implementation"
        result = extract_artifacts(output)
        files = [a for a in result if a["type"] == "file"]
        assert len(files) == 1
        assert files[0]["path"] == "src/main.py"

    def test_no_artifacts(self):
        """No artifacts in plain text"""
        output = "This is just plain text without any links"
        result = extract_artifacts(output)
        # May have zero or some false positives, just check it doesn't crash
        assert isinstance(result, list)

    def test_multiple_artifacts(self):
        """Multiple artifacts of different types"""
        output = """
        Created https://github.com/user/repo/pull/42
        See docs: https://example.com/docs
        Wrote src/app.js
        """
        result = extract_artifacts(output)
        assert len(result) >= 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
