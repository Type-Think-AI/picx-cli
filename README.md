# PicX Studio CLI

Full access to PicX Studio API from the terminal. Generate images and videos, manage albums, browse templates, curate moodboards, and more.

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
# Generate an image (saves to album automatically)
picx albums generate "a cat in a spacesuit on Mars"

# Generate with specific model and size
picx albums generate "neon city at night" -m gemini-3.1-flash-image-preview -s 2K -a 16:9

# Generate a video from prompt
picx albums generate "a sunset timelapse" --tool video_prompt --video-model veo-3.1 --video-duration 8s

# Generate video from frames
picx albums generate "smooth transition" --tool video_frames --start-frame https://example.com/start.jpg --end-frame https://example.com/end.jpg

# Multi-model generation
picx albums generate "cyberpunk cityscape" --models gemini-3.1-flash-image-preview,gemini-3-pro-image-preview -n 4

# Continue a conversation in an existing album
picx albums generate "make it brighter" --album-id <uuid>

# List your albums
picx albums list

# Browse templates
picx templates list --search "portrait"

# Explore public moodboards
picx moodboards discover --sort-by popular
```

## Commands

### Albums — Generate & Manage

The `albums` command handles image/video generation (with auto-save to albums) and album management.

#### Generate Images & Videos

```bash
# Image generation (default)
picx albums generate "a portrait in golden hour light" -m gemini-3.1-flash-image-preview -s 2K -a 16:9

# Multiple images
picx albums generate "cyberpunk cityscape" -n 4

# Multi-model comparison
picx albums generate "a red car" --models gemini-3.1-flash-image-preview,gemini-3-pro-image-preview

# Edit an existing image
picx albums generate "change background to sunset" -i https://example.com/photo.jpg

# Video from prompt
picx albums generate "waves crashing on rocks" --tool video_prompt --video-model veo-3.1 --video-duration 8s --video-orientation landscape

# Video from start/end frames
picx albums generate "smooth zoom transition" --tool video_frames --start-frame https://example.com/start.jpg --end-frame https://example.com/end.jpg

# Video from reference images
picx albums generate "a person walking" --tool video_references
```

| Flag | Short | Description |
|------|-------|-------------|
| `--model` | `-m` | Image model ID |
| `--models` | | Comma-separated model IDs for multi-model |
| `--size` | `-s` | `1K`, `2K`, or `4K` |
| `--aspect-ratio` | `-a` | `1:1`, `16:9`, `9:16`, `4:3` |
| `--image-url` | `-i` | Reference image URL (for editing) |
| `--num-images` | `-n` | Number of images (1,2,3,4,6,8,10) |
| `--tool` | | `image`, `video_prompt`, `video_frames`, `video_references` |
| `--video-model` | | `veo-3.1`, `veo-3.1-fast` |
| `--video-duration` | | `5s` or `8s` |
| `--video-orientation` | | `landscape`, `portrait`, `square` |
| `--album-id` | | Continue in an existing album |
| `--start-frame` | | Start frame image URL (video_frames) |
| `--end-frame` | | End frame image URL (video_frames) |

#### Album Management

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
picx templates list --target-model gemini-3.1-flash-image-preview --premium false
picx templates get <template-id>
picx templates categories
picx templates create --name "Sunset Glow" --prompt "golden hour..." --tags landscape,sunset --category photography --image-url https://... --preview-images https://img1.jpg,https://img2.jpg --media-type image --target-model gemini-3.1-flash-image-preview --aspect-ratio 16:9 --description "A warm sunset template"

# Upload local files as thumbnail and gallery images
picx templates create --name "My Style" --prompt "portrait in..." --image-url ./thumbnail.png --preview-images ./img1.png,./img2.jpg,./img3.webp

# Mix local files and URLs
picx templates create --name "Mixed" --prompt "landscape..." --image-url ./thumb.jpg --preview-images https://cdn.example.com/a.jpg,./local-b.png

picx templates update <template-id> --name "New Name" --prompt "updated prompt" --tags new,tags --image-url https://... --preview-images https://img1.jpg,https://img2.jpg --aspect-ratio 1:1 --featured true --archived false --premium true
picx templates update <template-id> --image-url ./new-thumb.png --preview-images ./a.png,./b.png
picx templates delete <template-id>
```

#### Template Admin (requires admin API key)

New templates submitted by users start with `status=pending` and must be approved before they are visible to other users.

```bash
# List templates by status (default: pending — shows new submissions)
picx templates admin list
picx templates admin list --status pending
picx templates admin list --status approved --limit 50
picx templates admin list --status archived --page 2

# Approve a single template (makes it visible to all users)
picx templates admin approve <template-id>

# Archive a single template (hides it permanently)
picx templates admin archive <template-id>

# Bulk approve or archive multiple templates in one call
picx templates admin bulk-status --ids 12,15,23 --action approve
picx templates admin bulk-status --ids 7,8,9 --action archive
```

**Status lifecycle:** `pending` → `approved` (visible to all) or `archived` (hidden permanently)

| Command | Endpoint | Description |
|---------|----------|-------------|
| `admin list` | `GET /admin/templates` | List templates filtered by status |
| `admin approve <id>` | `PATCH /admin/templates/{id}/approve` | Approve a pending template |
| `admin archive <id>` | `PATCH /admin/templates/{id}/archive` | Archive a template |
| `admin bulk-status` | `POST /admin/templates/bulk-status` | Approve or archive in bulk |

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
picx references update <id> --name "new-name" --image-urls https://new.png --instructions "updated" --usage-mode style --thumbnail-url https://...
picx references delete <id>
```

### Account & Utilities

```bash
picx auth                    # Check API key
picx me                      # User profile with credit balance
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
  "images": ["https://cdn.picxstudio.com/agno/images/img_a1b2c3.png"],
  "album_id": "uuid-here",
  "album_url": "https://picxstudio.com/c/uuid-here"
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
- [PicX Studio](https://picxstudio.com) - AI image & video generation app
- [npm Package](https://www.npmjs.com/package/picx-cli) - npm registry

## License

MIT
