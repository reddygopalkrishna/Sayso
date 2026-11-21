# Sayso site

A one-page static site: `index.html` and `styles.css`. No build step, no JavaScript, no external fonts or scripts, so it loads fast and sends nothing to third parties.

What it says is kept to what has been tested; each feature card states how far. Pricing is labelled "planned pricing, no billing yet". The demo video is a placeholder. Keep it that way: when something new is tested, change the card, and do not add a claim, a number or a testimonial that is not true yet.

## Preview locally

```bash
cd site && python3 -m http.server 8080   # then open http://localhost:8080
```

## Deploy to AWS

These steps have not been run from this repository (no AWS deployment was made); the commands are the standard ones, so check them against the current AWS console and docs on first use.

Either way you get HTTPS and a public address. Replace the bucket, app and domain names with your own.

### Option 1: S3 + CloudFront (static hosting, cheapest)

```bash
aws s3 mb s3://YOUR-BUCKET --region ap-south-1
aws s3 sync site/ s3://YOUR-BUCKET --exclude README.md --delete
```

Then in the AWS console: create a CloudFront distribution with the bucket as origin (use Origin Access Control, keep the bucket private), set the default root object to `index.html`, and attach a free ACM certificate if you use your own domain (the certificate must be in `us-east-1` for CloudFront). Re-run the `sync` command after each change, and invalidate the cache with `aws cloudfront create-invalidation --distribution-id YOUR-ID --paths "/*"`.

The S3 website endpoint alone (without CloudFront) is HTTP only, so do not use it for the public address.

### Option 2: AWS Amplify Hosting (simplest, deploys from git)

1. In the Amplify console choose **Host web app**, connect the repository and branch.
2. Set the app's base directory to `site` (a monorepo setting) and leave the build command empty. If Amplify asks for a build spec, use:

   ```yaml
   version: 1
   frontend:
     phases:
       build:
         commands: []
     artifacts:
       baseDirectory: site
       files:
         - '**/*'
   ```

3. Every push to that branch redeploys. Add a custom domain under **Hosting → Custom domains**.

## Before going public

- Replace the demo-video placeholder in `index.html` with the real video once it exists.
- Re-read every card against `CHANGELOG.md` so nothing claims more than has been tested.
- Add a way to contact you or a download link only when they exist.
