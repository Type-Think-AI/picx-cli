---
name: picx
description: AI image generation CLI. Generate and edit images using PicX Studio's multi-model API.
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

# PicX Studio - AI Image Generation

Generate and edit images from the terminal using PicX Studio's API.

## Setup

The `PICX_API_KEY` environment variable must be set. Get your key at https://picxstudio.com/developer

## Available Commands

### Discover models
```bash
picx models
```
Returns a JSON list of available models with their IDs, names, and credit costs.

### Generate an image
```bash
picx generate "a cat wearing a spacesuit on Mars" --model gemini-3.1-flash-image-preview --size 1K --aspect-ratio 16:9
```
**Flags:**
- `--model` / `-m` - Model ID (run `picx models` to see options). Default: `gemini-3.1-flash-image-preview`
- `--size` / `-s` - Image size: `1K`, `2K`, or `4K`. Default: `1K`
- `--aspect-ratio` / `-a` - Aspect ratio: `1:1`, `16:9`, `9:16`, `4:3`, `3:2`, `2:3`, `3:4`. Default: `1:1`

### Edit an existing image
```bash
picx edit "change the background to a sunset beach" --image-url https://example.com/photo.jpg --model gemini-3.1-flash-image-preview
```
**Flags:**
- `--image-url` / `-i` - **(Required)** URL of the image to edit
- `--model` / `-m` - Model ID
- `--size` / `-s` - Output size: `1K`, `2K`, `4K`

### Check authentication
```bash
picx auth
```

### View usage statistics
```bash
picx usage --period 30d
```

## Output Format

All commands output structured JSON for easy parsing:

```json
{
  "success": true,
  "id": "img_abc123",
  "url": "https://cdn.picxstudio.com/...",
  "model": "gemini-3.1-flash-image-preview",
  "credits_used": 20,
  "created_at": "2026-03-20T12:00:00Z"
}
```

On error:
```json
{
  "success": false,
  "error": "Insufficient credits"
}
```

## Tips
- Use `picx models` to discover available models and their credit costs before generating
- The `gemini-3.1-flash-image-preview` model is fastest and cheapest (20 credits for 1K)
- The `gemini-3-pro-image-preview` model produces highest quality (50 credits for 1K)
- Use `--size 4K` for ultra-high-resolution output (costs more credits)
- The `url` field in the response is a permanent public URL to the generated image
