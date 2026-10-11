# Rollback

How to put the previous version of the site back in Vercel. Based on Vercel's Instant Rollback docs.

## Roll back

1. Open the project in the Vercel dashboard. On the **Overview** page, find the **Production Deployment** tile and press **Instant Rollback**.
2. A dialog shows the current production deployment and the one you can roll back to. On the free (Hobby) plan you can only roll back to the **immediately previous** deployment. Pro plans can choose any earlier one.
3. Check the domains listed, then press **Confirm Rollback**. It takes effect instantly.

You can also open **Deployments**, filter by `main`, press the three dots on an older deployment, and choose **Instant Rollback**.

## What to know

- **New pushes stop going live.** After a rollback Vercel turns off automatic production deploys. Pushing to `main` will not replace the rolled-back version until you undo the rollback.
- **Environment variables are not rolled back.** The old deployment keeps the values it was built with. Changing variables in settings does not change it.
- **Cron jobs also revert** to the state of the old deployment.
- **The database is not rolled back.** Supabase data stays as it is. If a bad version wrote wrong data, fix it in the Supabase Table Editor.

## Undo the rollback (go back to normal deploys)

On the Production Deployment tile press **Undo Rollback**, choose the deployment to promote, and confirm. Or from a terminal: `vercel promote <deployment-url>`.

## Rolling back the code instead

If you want the fix in Git as well: find the last good commit with `git log --oneline`, then `git revert <bad-commit>` and push. Vercel will deploy the revert automatically.
