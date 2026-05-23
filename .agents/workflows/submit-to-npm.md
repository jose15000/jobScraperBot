---
description: Workflow to update changes on npm
---

> [!WARNING]
> **Do not publish microupdates!** Publishing every small change to NPM exhausts semantic versioning, slows down testing, and pollutes the public registry.
> 
> **For Local Testing:** Do NOT use this workflow. Instead, install the package locally in your target project using an absolute path:
> `npm install /absolute/path/to/ContextAtlas`
> Then simply run `npm run build` in the ContextAtlas directory whenever you make changes. 

Use this workflow **ONLY** to upload finished, stable code changes on npm as a new version: 

```
\\turbo-all

npm run build && \
npm version patch --no-git-tag-version --force && \
git add . && \
git commit -m "chore: release nova versão" && \
git push && \
npm publish
```