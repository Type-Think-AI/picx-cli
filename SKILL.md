---
name: picx
description: PicX Studio CLI - Full access to image/video generation, albums, templates, moodboards, references and discovery from the terminal.
metadata:
  openclaw:
    requires:
      env:
        - PICX_API_KEY
      bins:
        - picx
    primaryEnv: PICX_API_KEY
    homepage: https://picxstudio.com/developer
---

# PicX Studio CLI

Full access to PicX Studio API from the terminal. Generate images and videos, manage albums, browse templates, curate moodboards, and more.

## Setup

The `PICX_API_KEY` environment variable must be set. Get your key at https://picxstudio.com/developer

## Commands

### Albums — Generate Images & Videos

Generation is done via the `albums generate` subcommand. It streams results via SSE and auto-saves to an album.

```bash
# Generate an image (default tool=image)
picx albums generate "a cat in a spacesuit" -m gemini-3.1-flash-image-preview -s 2K -a 16:9

# Multiple images
picx albums generate "cyberpunk city" -n 4

# Multi-model comparison
picx albums generate "a red car" --models gemini-3.1-flash-image-preview,gemini-3-pro-image-preview

# Edit an existing image
picx albums generate "change background to sunset" -i https://example.com/photo.jpg

# Continue conversation in existing album
picx albums generate "make it brighter" --album-id <uuid>

# Video from prompt
picx albums generate "waves crashing on rocks" --tool video_prompt --video-model veo-3.1 --video-duration 8s --video-orientation landscape

# Video from start/end frames
picx albums generate "smooth zoom" --tool video_frames --start-frame https://example.com/start.jpg --end-frame https://example.com/end.jpg

# Video from reference images
picx albums generate "a person walking" --tool video_references
```

### Albums (Chat Histories)

```bash
picx albums list --limit 20 --offset 0
picx albums get <album-id>
picx albums create "My Project"
picx albums update <album-id> --title "New Title"
picx albums delete <album-id>
picx albums archive <album-id>          # Toggle archive
picx albums pin <album-id>              # Toggle pin
picx albums gallery --limit 50          # All generated images
picx albums share <album-id>            # Create share link
picx albums unshare <album-id>          # Remove share link
picx albums shared <share-id>           # View shared album (public)
picx albums public                      # Browse public albums
```

### Templates

```bash
picx templates list --search "portrait" --category photography --limit 10
picx templates list --media-type image --featured true --tags "landscape,sunset"
picx templates get <template-id>
picx templates categories
picx templates create --name "Sunset Glow" --prompt "golden hour..." --category photography --tags landscape,sunset --image-url https://... --media-type image --target-model gemini-3.1-flash-image-preview
picx templates create --name "My Style" --prompt "portrait..." --image-url ./thumb.png --preview-images ./img1.png,./img2.jpg
picx templates update <template-id> --name "New Name" --tags new,tags
picx templates update <template-id> --image-url ./new-thumb.png --preview-images ./a.png,./b.png
picx templates delete <template-id>
```

### Moodboards

```bash
# CRUD
picx moodboards list
picx moodboards get <id>
picx moodboards get-by-slug <slug>
picx moodboards create "My Collection" --description "Best work" --public --tags design,minimal
picx moodboards update <id> --name "Updated" --public true
picx moodboards delete <id>

# Templates in moodboard
picx moodboards templates <moodboard-id>
picx moodboards add-template <moodboard-id> <template-id>
picx moodboards add-templates-bulk <moodboard-id> --ids 1,2,3
picx moodboards remove-template <moodboard-id> <template-id>

# Albums in moodboard
picx moodboards albums <moodboard-id>
picx moodboards add-album <moodboard-id> <album-id>
picx moodboards add-albums-bulk <moodboard-id> --ids uuid1,uuid2
picx moodboards remove-album <moodboard-id> <album-id>

# Discovery & Social
picx moodboards discover --search "minimal" --sort-by popular
picx moodboards featured
picx moodboards shared <share-id>
picx moodboards share <id>
picx moodboards like <id>
picx moodboards unlike <id>
picx moodboards clone <id>
```

### Image References (@mentions)

```bash
picx references list
picx references get <id>
picx references create "brand-logo" --image-urls https://cdn.example.com/logo.png --instructions "Use as watermark"
picx references update <id> --name "new-name"
picx references delete <id>
```

### Account & Utilities

```bash
picx auth                              # Check API key status
picx me                                # Get user profile with credit balance
picx usage --period 30d                # API usage stats
picx models                            # List image/video models
picx model-config                      # Full model configuration
picx upload ./photo.png                # Upload local image to PicX storage
```

### Discovery

```bash
picx discovery tags --source all --limit 50
picx discovery tags-detailed --source templates
```

## Output Format

All commands output structured JSON:

```json
{
  "success": true,
  "images": ["https://cdn.picxstudio.com/agno/images/img_abc123.png"],
  "album_id": "uuid-here",
  "album_url": "https://picxstudio.com/c/uuid-here"
}
```

On error:
```json
{
  "success": false,
  "error": "Insufficient credits"
}
```
