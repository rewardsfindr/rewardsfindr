# RewardsFindr

![Tests](https://github.com/rewardsfindr/rewardsfindr/actions/workflows/test.yml/badge.svg)

Find the best credit card rewards for any store. Search any merchant and instantly see which credit card gives you the highest cashback or points rate.

🌐 **Website:** [rewardsfindr.com](https://rewardsfindr.com) ([web repo](https://github.com/rewardsfindr/rewardsfindr-web))  
📱 **Mobile App:** Expo (iOS & Android) — offers sync and search run on-device

## Repository Structure

```
rewardsfindr/
├── mobile/        # React Native / Expo app (product)
├── shared/        # Shared utilities
├── src/shared/    # Shared constants used across projects
├── docs/          # Ops / product notes
└── .github/       # CI workflows
```

There is **no RewardsFindr HTTP API** in this repo. Bank sync, offer catalog, search, and history live on the phone (AsyncStorage + Firebase Auth). The former Express / Cloud Run service was removed; see [docs/retire-cloud-run.md](docs/retire-cloud-run.md) for GCP cleanup notes (GitHub Preview/Production Environments already cleared).

## Related Repositories

- **[rewardsfindr-web](https://github.com/rewardsfindr/rewardsfindr-web)** - Marketing landing page (React, deployed on Vercel)

## Development

```bash
cd mobile
npm install
npm start
```

Firebase Auth env vars are documented in `mobile/.env.example`. No backend URL is required for normal use.

## Testing

```bash
cd mobile && npm test
```

## Tech Stack

- **Mobile:** React Native, Expo, Firebase Auth
- **Offers:** On-device catalog under `mobile/lib/catalog/`
- **Web (separate repo):** React / Vercel

## Contributing

All changes must go through a pull request. Direct commits to main are not allowed.

## Contact

📧 hello@rewardsfindr.com
