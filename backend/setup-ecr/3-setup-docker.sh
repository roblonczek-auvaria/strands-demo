# 3. Set up Docker buildx for ARM64 (AgentCore requirement)
# Remove existing builder if it exists
docker buildx rm agentcore-builder 2>/dev/null || true

# Create new builder
docker buildx create --use --name agentcore-builder --platform linux/arm64

# Use the builder
docker buildx use agentcore-builder

# Bootstrap the builder
docker buildx inspect --bootstrap