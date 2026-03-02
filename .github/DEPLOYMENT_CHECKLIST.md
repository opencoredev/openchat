# Deployment Setup Checklist

Use this checklist to track the setup and testing of automatic Convex deployment.

## Initial Setup

- [ ] Review all created files
  - [ ] `.github/workflows/deploy-production.yml`
  - [ ] `scripts/run-migrations.ts`
  - [ ] `.github/workflows/README.md`
  - [ ] `docs/deployment.md`

- [ ] Add GitHub Secret: `CONVEX_DEPLOY_KEY`
  - [ ] Obtain key from Convex Dashboard or Vercel
  - [ ] Add to GitHub: Settings → Secrets and variables → Actions
  - [ ] Verify secret is added correctly

- [ ] Verify existing secrets
  - [ ] `CONVEX_URL` exists (used by prod-canary)

## Testing

### Local Testing (Recommended First)

- [ ] Test manual deployment
  ```bash
  bun run deploy
  ```
  - [ ] Deployment succeeds
  - [ ] Production URL configured correctly

- [ ] Test migration runner
  ```bash
  bun run convex:migrate
  ```
  - [ ] Migrations run successfully
  - [ ] No errors in output

- [ ] Verify data consistency
  ```bash
  bun run convex:verify
  ```
  - [ ] Verification passes
  - [ ] No inconsistencies found

### GitHub Actions Testing

- [ ] Trigger deployment workflow
  ```bash
  git checkout main
  git pull
  # Make a small change
  git commit -m "test: trigger deployment workflow"
  git push origin main
  ```

- [ ] Monitor "Production Canary" workflow
  - [ ] Workflow starts automatically
  - [ ] Canary checks pass
  - [ ] No errors in logs

- [ ] Monitor "Deploy to Production" workflow
  - [ ] Workflow waits for canary completion
  - [ ] Convex deployment succeeds
  - [ ] Migrations run successfully
  - [ ] Data verification passes
  - [ ] No errors in logs

- [ ] Verify deployment in Convex Dashboard
  - [ ] Visit https://dashboard.convex.dev/t/outgoing-setter-201
  - [ ] Check latest deployment timestamp
  - [ ] Review deployment logs
  - [ ] Verify function versions updated

- [ ] Verify Vercel deployment
  - [ ] Web app deployed successfully
  - [ ] Connected to production Convex
  - [ ] No runtime errors

## Post-Deployment

- [ ] Run production canary tests
  ```bash
  bun run verify:prod
  ```
  - [ ] Tests pass
  - [ ] Production is operational

- [ ] Check data consistency
  - [ ] Visit Convex Dashboard
  - [ ] Verify dbStats table populated
  - [ ] Verify messageCount fields populated

- [ ] Monitor for errors
  - [ ] Check Convex logs (15-30 minutes)
  - [ ] Check Vercel logs (15-30 minutes)
  - [ ] No unusual error rates

## Documentation

- [ ] Review team documentation
  - [ ] Team aware of new deployment process
  - [ ] Team knows where to find documentation
  - [ ] Team knows troubleshooting steps

- [ ] Update team processes
  - [ ] Merge to main triggers auto-deploy
  - [ ] Monitor GitHub Actions after merge
  - [ ] Know how to rollback if needed

## Security

- [ ] Enable branch protection on main (if not already)
  - [ ] Require PR reviews
  - [ ] Require status checks to pass
  - [ ] Prevent force pushes

- [ ] Review secret access
  - [ ] Only authorized users can view/edit secrets
  - [ ] Secrets are not exposed in logs
  - [ ] Plan for periodic secret rotation

## Monitoring & Alerts

- [ ] Set up monitoring (optional but recommended)
  - [ ] GitHub Actions notification emails enabled
  - [ ] Convex error alerts configured
  - [ ] Vercel error alerts configured

- [ ] Document rollback procedure
  - [ ] Team knows how to rollback Convex
  - [ ] Team knows how to rollback Vercel
  - [ ] Test rollback procedure (optional)

## Troubleshooting Knowledge

- [ ] Team familiar with common issues
  - [ ] Invalid deploy key → Check GitHub Secrets
  - [ ] Canary failed → Check Convex status
  - [ ] Migration failed → Run manually

- [ ] Team knows where to find help
  - [ ] `.github/workflows/README.md`
  - [ ] `docs/deployment.md`

## Final Verification

- [ ] Make a real deployment
  - [ ] Merge a real PR to main
  - [ ] Monitor full deployment cycle
  - [ ] Verify everything works end-to-end

- [ ] Update this checklist
  - [ ] Note any issues encountered
  - [ ] Document any additional steps needed
  - [ ] Share learnings with team

---

## Notes

Use this section to track issues, learnings, or additional steps:

```
Date: ___________

Issue encountered:


Resolution:


Additional steps needed:


Team feedback:


```

---

## Sign-off

- [ ] Deployment setup complete
- [ ] Team trained
- [ ] Documentation reviewed
- [ ] Ready for production use

**Completed by**: ___________________
**Date**: ___________________
**Sign-off**: ___________________
