# picx-cli

AI image generation from the terminal. Generate and edit images using [PicX Studio](https://picxstudio.com)'s multi-model API.

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

## Usage

### Generate an image

```bash
picx generate "a cat in a spacesuit on Mars"
```

With options:

```bash
picx generate "neon city at night" --model gemini-3-pro-image-preview --size 2K --aspect-ratio 16:9
```

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--model` | `-m` | Model ID (run `picx models` to see all) | `gemini-3.1-flash-image-preview` |
| `--size` | `-s` | `1K`, `2K`, or `4K` | `1K` |
| `--aspect-ratio` | `-a` | `1:1`, `16:9`, `9:16`, `4:3`, `3:2` | `1:1` |

### Edit an image

```bash
picx edit "change the background to a beach sunset" --image-url https://example.com/photo.jpg
```

| Flag | Short | Description | Required |
|------|-------|-------------|----------|
| `--image-url` | `-i` | URL of the image to edit | Yes |
| `--model` | `-m` | Model ID | No |
| `--size` | `-s` | `1K`, `2K`, or `4K` | No |

### List models

```bash
picx models
```

### Check auth

```bash
picx auth
```

### View usage

```bash
picx usage --period 30d
```

## Output

All commands return JSON:

```json
{
  "success": true,
  "id": "img_a1b2c3d4e5f6",
  "url": "https://cdn.picxstudio.com/api/generated/image.png",
  "model": "gemini-3.1-flash-image-preview",
  "size": "1K",
  "aspect_ratio": "1:1",
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

## Models

| Model | Name | 1K | 2K | 4K |
|-------|------|----|----|----|
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | 20 | 20 | 40 |
| `gemini-3-pro-image-preview` | Nano Banana Pro | 50 | 50 | 100 |

Run `picx models` to see the full live list.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PICX_API_KEY` | Your API key (starts with `pxsk_`) | Yes |
| `PICX_API_URL` | Custom API base URL | No |

## Use with AI Agents (OpenClaw)

This CLI is designed for AI agent use. Set `PICX_API_KEY` in your environment and any OpenClaw-compatible agent can call `picx` commands to generate images.

See [SKILL.md](./SKILL.md) for the OpenClaw skill definition.

## REST API

You can also call the API directly without the CLI:

```bash
curl -X POST https://api.picxstudio.com/v1/images/generate \
  -H "Authorization: Bearer pxsk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a sunset over mountains", "size": "1K"}'
```

Full API docs at [picxstudio.com/developer](https://picxstudio.com/developer).

## Links

- [Developer Portal](https://picxstudio.com/developer) - Get your API key and explore docs
- [PicX Studio](https://picxstudio.com) - AI image generation app
- [API Reference](https://picxstudio.com/developer) - Full endpoint documentation

## License

MIT
