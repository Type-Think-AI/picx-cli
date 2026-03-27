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

# Edit an image
picx edit "change background to sunset" --image-url https://example.com/photo.jpg

# Stream generation with multiple images
picx stream "cyberpunk cityscape" --num-images 4

# List your albums
picx albums list

# Browse templates
picx templates list --search "portrait"

# Explore public moodboards
picx moodboards discover --sort-by popular
```

## Commands

### Image Generation

```bash
# Generate a single image
picx generate "neon city at night" -m gemini-3-pro-image-preview -s 2K -a 16:9

# Edit an existing image
picx edit "make it brighter" --image-url https://cdn.example.com/photo.jpg -m gemini-3.1-flash-image-preview -s 2K

# Streaming generation via AI agent (supports image + video)
picx stream "a futuristic car ad" --num-images 4 --model gemini-3.1-flash-image-preview --size 2K --aspect-ratio 16:9
picx stream "a sunset timelapse" --tool video_prompt --video-model veo-3.1 --video-duration 8s --video-orientation landscape
picx stream "animate this" --tool video_frames --start-frame https://example.com/start.jpg --end-frame https://example.com/end.jpg
```

| Flag | Short | Description | Commands |
|------|-------|-------------|----------|
| `--model` | `-m` | Model ID | generate, edit, stream |
| `--size` | `-s` | `1K`, `2K`, or `4K` | generate, edit, stream |
| `--aspect-ratio` | `-a` | `1:1`, `16:9`, `9:16`, `4:3`, `3:2` | generate, stream |
| `--image-url` | `-i` | Source image URL (required for edit) | edit |
| `--num-images` | `-n` | Number of images (1,2,3,4,6,8,10) | stream |
| `--tool` | | `image`, `video_prompt`, `video_frames`, `video_references` | stream |
| `--video-model` | | `veo-3.1`, `veo-3.1-fast` | stream |
| `--video-duration` | | `5s` or `8s` | stream |
| `--video-orientation` | | `landscape`, `portrait`, `square` | stream |
| `--session-id` | | Session ID for conversation tracking | stream |
| `--album-id` | | Album ID to persist chat history | stream |
| `--start-frame` | | Start frame image URL | stream |
| `--end-frame` | | End frame image URL | stream |

### Albums (Chat Histories)

```bash
picx albums list --limit 20 --offset 0 --archived false --folder-id <id>
picx albums get <album-id>
picx albums create "My Project" --chat '{"messages":[]}' --folder-id <id>
picx albums update <album-id> --title "New Title" --archived true --pinned true --folder-id <id>
picx albums delete <album-id>
picx albums archive <album-id>
picx albums pin <album-id>
picx albums gallery --limit 50 --offset 0
picx albums share <album-id>
picx albums unshare <album-id>
picx albums shared <share-id>
picx albums public --limit 20 --offset 0
```

### Templates

```bash
picx templates list --search "portrait" --category photography --limit 10 --page 1
picx templates list --media-type image --featured true --tags "landscape,sunset"
picx templates get <template-id>
picx templates categories
picx templates create --name "Sunset Glow" --prompt "golden hour..." --tags landscape,sunset --category photography --image-url https://... --media-type image --target-model gemini-3.1-flash-image-preview
picx templates update <template-id> --name "New Name" --prompt "updated prompt" --tags new,tags --image-url https://...
picx templates delete <template-id>
```

### Moodboards

```bash
# CRUD
picx moodboards list --limit 20 --offset 0
picx moodboards get <id>
picx moodboards get-by-slug <slug>
picx moodboards create "My Collection" --description "Best work" --public --cover-image https://... --tags design,minimal
picx moodboards update <id> --name "Updated" --public true --description "new desc" --cover-image https://... --tags new,tags
picx moodboards delete <id>

# Templates in moodboard
picx moodboards templates <moodboard-id> --limit 20 --offset 0
picx moodboards add-template <moodboard-id> <template-id>
picx moodboards add-templates-bulk <moodboard-id> --ids 1,2,3
picx moodboards remove-template <moodboard-id> <template-id>

# Albums in moodboard
picx moodboards albums <moodboard-id> --limit 20 --offset 0
picx moodboards add-album <moodboard-id> <album-id>
picx moodboards add-albums-bulk <moodboard-id> --ids uuid1,uuid2,uuid3
picx moodboards remove-album <moodboard-id> <album-id>

# Discovery & Social
picx moodboards discover --search "minimal" --sort-by popular --profile-type <type>
picx moodboards featured --limit 10
picx moodboards shared <share-id>
picx moodboards share <id>
picx moodboards like <id>
picx moodboards unlike <id>
picx moodboards clone <id>
```

### Image References

```bash
picx references list
picx references get <id>
picx references create "brand-logo" --image-urls https://cdn.example.com/logo.png --instructions "Use as brand identity" --usage-mode person --thumbnail-url https://...
picx references update <id> --name "new-name" --image-urls https://new.png --instructions "updated" --usage-mode style
picx references delete <id>
```

### Account & Utilities

```bash
picx auth                    # Check API key
picx me                      # User profile
picx usage --period 30d      # Usage stats (7d, 30d, 90d)
picx models                  # List available models
picx model-config            # Full model config (image + video + agent models, settings)
picx upload ./photo.png      # Upload image to PicX storage
```

### Discovery

```bash
picx discovery tags --source all --limit 50
picx discovery tags-detailed --source templates --limit 50
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
picx moodboards discover | jq '.items[] | {name, slug, template_count}'
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PICX_API_KEY` | Your API key (starts with `pxsk_`) | Yes |
| `PICX_API_URL` | Custom API base URL (default: `https://new-api.picxstudio.com`) | No |

## Use with AI Agents

This CLI is designed for AI agent use. Set `PICX_API_KEY` in your environment and any agent can call `picx` commands directly.

See [SKILL.md](./SKILL.md) for the skill definition.

## Links

- [Developer Portal](https://picxstudio.com/developer) - Get your API key
- [PicX Studio](https://picxstudio.com) - AI image generation app
- [npm Package](https://www.npmjs.com/package/picx-cli) - npm registry

## License

MIT
