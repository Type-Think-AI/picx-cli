# PicX Studio CLI

Full access to PicX Studio API from the terminal. Generate images, manage albums, browse templates, curate moodboards, and more.

## Install

```bash
npm install -g picx-cli
```

## Setup

1. Go to [picxstudio.com/developer](https://picxstudio.com/developer)
2. Sign in and click **Generate API Key**
3. Copy the key (starts with `pxsk_`)
4. Set it in your terminal:

```bash
export PICX_API_KEY=pxsk_your_key_here
```

Add it to `~/.bashrc` or `~/.zshrc` to persist across sessions.

## Quick Start

```bash
# Generate an image
picx generate "a cat in a spacesuit on Mars"

# List your albums
picx albums list

# Browse templates
picx templates list --search "portrait"

# Explore public moodboards
picx moodboards discover --sort-by popular

# Upload a local image
picx upload ./photo.png
```

## Commands

### Image Generation

```bash
picx generate "neon city at night" --model gemini-3-pro-image-preview --size 2K --aspect-ratio 16:9
picx edit "change background to sunset" --image-url https://example.com/photo.jpg
picx stream "cyberpunk cityscape" --num-images 4 --model gemini-3.1-flash-image-preview
```

| Flag | Short | Description |
|------|-------|-------------|
| `--model` | `-m` | Model ID (run `picx models` to see all) |
| `--size` | `-s` | `1K`, `2K`, or `4K` |
| `--aspect-ratio` | `-a` | `1:1`, `16:9`, `9:16`, `4:3`, `3:2` |

### Albums (Chat Histories)

```bash
picx albums list --limit 20 --offset 0
picx albums get <album-id>
picx albums create "My Project"
picx albums update <album-id> --title "New Title"
picx albums delete <album-id>
picx albums archive <album-id>
picx albums pin <album-id>
picx albums gallery --limit 50
picx albums share <album-id>
picx albums unshare <album-id>
picx albums shared <share-id>
picx albums public
```

### Templates

```bash
picx templates list --search "portrait" --category photography --limit 10
picx templates get <template-id>
picx templates categories
picx templates create --name "Sunset Glow" --prompt "golden hour..." --tags landscape,sunset
picx templates update <template-id> --name "New Name"
picx templates delete <template-id>
```

### Moodboards

```bash
picx moodboards list
picx moodboards get <id>
picx moodboards get-by-slug <slug>
picx moodboards create "My Collection" --description "Best work" --public --tags design,minimal
picx moodboards update <id> --name "Updated" --public true
picx moodboards delete <id>

# Templates & Albums in moodboard
picx moodboards templates <moodboard-id>
picx moodboards add-template <moodboard-id> <template-id>
picx moodboards add-templates-bulk <moodboard-id> --ids 1,2,3
picx moodboards remove-template <moodboard-id> <template-id>
picx moodboards albums <moodboard-id>
picx moodboards add-album <moodboard-id> <album-id>
picx moodboards remove-album <moodboard-id> <album-id>

# Discovery & Social
picx moodboards discover --search "minimal" --sort-by popular
picx moodboards featured
picx moodboards share <id>
picx moodboards like <id>
picx moodboards unlike <id>
picx moodboards clone <id>
```

### Image References

```bash
picx references list
picx references get <id>
picx references create "brand-logo" --image-urls https://cdn.example.com/logo.png
picx references update <id> --name "new-name"
picx references delete <id>
```

### Account & Utilities

```bash
picx auth                    # Check API key
picx me                      # User profile
picx usage --period 30d      # Usage stats
picx models                  # List models
picx model-config            # Full model config
picx upload ./photo.png      # Upload image
```

### Discovery

```bash
picx discovery tags --source all --limit 50
picx discovery tags-detailed --source templates
```

## Output

All commands return JSON:

```json
{
  "success": true,
  "id": "img_a1b2c3d4e5f6",
  "url": "https://cdn.picxstudio.com/api/generated/image.png",
  "model": "gemini-3.1-flash-image-preview",
  "credits_used": 20
}
```

Use `jq` for filtering:

```bash
picx albums list | jq '.items[].title'
picx models | jq '.models[] | {id, name}'
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PICX_API_KEY` | Your API key (starts with `pxsk_`) | Yes |
| `PICX_API_URL` | Custom API base URL | No |

## Use with AI Agents (OpenClaw)

This CLI is designed for AI agent use. Set `PICX_API_KEY` in your environment and any OpenClaw-compatible agent can call `picx` commands.

See [SKILL.md](./SKILL.md) for the OpenClaw skill definition.

## Links

- [Developer Portal](https://picxstudio.com/developer) - Get your API key
- [PicX Studio](https://picxstudio.com) - AI image generation app

## License

MIT
