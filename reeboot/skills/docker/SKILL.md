---
name: docker
description: Docker and Docker Compose operations via docker CLI — manage containers, images, volumes, networks, and compose services. Use when working with Docker containers or Docker Compose deployments.
---

# Docker

Wraps the `docker` and `docker compose` CLIs for container management, image operations, and Docker Compose service orchestration.

## Setup

1. Install Docker:
   - **macOS/Windows**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - **Linux**: Install [Docker Engine](https://docs.docker.com/engine/install/)

2. Verify installation:
   ```bash
   docker info
   docker --version
   docker compose version
   ```

3. Ensure your user has Docker permissions (Linux):
   ```bash
   sudo usermod -aG docker $USER
   # Log out and back in for this to take effect
   ```

## Usage

### Containers

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Start a container
docker start <container_name_or_id>

# Stop a container
docker stop <container_name_or_id>

# Remove a container
docker rm <container_name_or_id>

# View container logs
docker logs <container_name_or_id>
docker logs -f <container_name_or_id>    # follow (stream) logs
docker logs --tail 100 <container>       # last 100 lines

# Execute a command in a running container
docker exec -it <container> bash
docker exec <container> cat /etc/hosts

# Inspect container details
docker inspect <container>
```

### Images

```bash
# List images
docker images

# Pull an image
docker pull nginx:latest
docker pull postgres:16

# Build an image from Dockerfile
docker build -t myapp:latest .
docker build -t myapp:1.0 -f Dockerfile.prod .

# Remove an image
docker rmi nginx:latest

# Tag an image
docker tag myapp:latest registry.example.com/myapp:1.0

# Push an image
docker push registry.example.com/myapp:1.0
```

### Docker Compose

```bash
# Start services (detached)
docker compose up -d

# Start specific service
docker compose up -d postgres

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v

# View service logs
docker compose logs -f api

# Restart a service
docker compose restart api

# Scale a service
docker compose up -d --scale worker=3

# Rebuild and restart
docker compose up -d --build

# List compose services
docker compose ps
```

### Volumes and Networks

```bash
# List volumes
docker volume ls

# Inspect a volume
docker volume inspect myapp_data

# List networks
docker network ls

# Inspect a network
docker network inspect bridge
```
