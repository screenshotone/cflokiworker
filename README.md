# cflokiworker

`cflokiworker` is a [Cloudflare Tail Worker](https://developers.cloudflare.com/workers/observability/tail-workers/) for pushing logs and unhandled exceptions to [Grafana Loki](https://grafana.com/oss/loki/) from your Cloudflare workers.

The worker is being used on production for collecting logs from [the ScreenshotOne API](https://screenshotone.com/) Gateway which is implemented as a Cloudflare worker.

## Getting Started

### Clone or Fork, and Deploy

You can clone the repository and use it directly for your needs without any modifications.

```shell
git clone git@github.com:screenshotone/cflokiworker.git
npm install
npm run deploy
```

Or you can fork it, modify, and deploy your version of the worker. If you feel it can be shared with everybody, don't hesitate to contribute back by creating a pull request.

### Attach to Workers

Once deployed to Cloudflare, you need to update your `wrangler.toml` for workers you want to stream logs from:

```toml
tail_consumers = [{ service = "logger" }]
```

## GitHub Actions

When using with GitHub Actions, you need to have 2 secrets available:

- `LOKI_PUSH_URL`` is an HTTP URL of the Loki instance.
- `LOKI_CREDENTIALS` is a base64-encoded username:password for accessing the Loki instance.

## Resources

You can learn more about Cloudflare Tail Workers at:

1. [Cloudflare Tail Workers official documentation](https://developers.cloudflare.com/workers/observability/tail-workers/).
2. [A guide on pushing logs to Grafana Loki from Cloudflare Workers with Tail Workers](https://scalabledeveloper.com/posts/cloudflare-tail-worker-for-pushing-logs-to-grafana-loki/).

## License

`cflokiworker` is released under [the MIT license](LICENSE).
