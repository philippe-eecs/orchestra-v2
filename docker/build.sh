#!/bin/bash
# Build Orchestra agent Docker images
#
# Usage:
#   ./build.sh           # Build all images
#   ./build.sh full      # Build full image only
#   ./build.sh claude    # Build Claude-only image
#   ./build.sh --push    # Build and push to registry

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Registry (override with REGISTRY env var)
REGISTRY="${REGISTRY:-}"
TAG="${TAG:-latest}"

build_full() {
    echo "Building orchestra-agent:full..."
    docker build -t orchestra-agent:full -f Dockerfile .

    if [[ -n "$REGISTRY" ]]; then
        docker tag orchestra-agent:full "$REGISTRY/orchestra-agent:full-$TAG"
    fi
}

build_claude() {
    echo "Building orchestra-agent:claude..."
    docker build -t orchestra-agent:claude -f Dockerfile.claude .

    if [[ -n "$REGISTRY" ]]; then
        docker tag orchestra-agent:claude "$REGISTRY/orchestra-agent:claude-$TAG"
    fi
}

push_images() {
    if [[ -z "$REGISTRY" ]]; then
        echo "Error: REGISTRY environment variable required for push"
        exit 1
    fi

    echo "Pushing images to $REGISTRY..."
    docker push "$REGISTRY/orchestra-agent:full-$TAG"
    docker push "$REGISTRY/orchestra-agent:claude-$TAG"
}

# Parse arguments
PUSH=false
TARGET="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        full|claude|all)
            TARGET="$1"
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [full|claude|all] [--push] [--registry REGISTRY] [--tag TAG]"
            exit 1
            ;;
    esac
done

# Build requested images
case $TARGET in
    full)
        build_full
        ;;
    claude)
        build_claude
        ;;
    all)
        build_full
        build_claude
        ;;
esac

# Push if requested
if [[ "$PUSH" == "true" ]]; then
    push_images
fi

echo ""
echo "Build complete!"
echo ""
echo "Available images:"
docker images | grep orchestra-agent | head -5

echo ""
echo "Test with:"
echo "  docker run --rm orchestra-agent:full claude --version"
echo "  docker run --rm -v \$(pwd):/workspace orchestra-agent:full claude -p 'Hello'"
