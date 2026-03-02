# RewardsFindr

![Tests](https://github.com/rewardsfindr/rewardsfindr/actions/workflows/test.yml/badge.svg)

Find the best credit card rewards for any store. Search any merchant and instantly see which credit card gives you the highest cashback or points rate.

🌐 **Website:** [rewardsfindr.com](https://rewardsfindr.com) ([web repo](https://github.com/rewardsfindr/rewardsfindr-web))  
📱 **Mobile App:** Coming soon (iOS & Android)  
🔌 **Browser Extension:** Chrome extension (in development)

## Repository Structure

This is a monorepo containing multiple components of the RewardsFindr platform:

```
rewardsfindr/
├── api/           # Backend API (Node.js/Express)
├── mobile/        # React Native mobile app
├── extension/     # Chrome browser extension
├── shared/        # Shared utilities and types
├── src/shared/    # Shared constants used across projects
└── .github/       # CI/CD workflows
```

## Related Repositories

- **[rewardsfindr-web](https://github.com/rewardsfindr/rewardsfindr-web)** - Marketing landing page (React, deployed on Vercel)
- **[rewardsfindr-mobile](https://github.com/rewardsfindr/rewardsfindr-mobile)** - Mobile app (coming soon)
- **[rewardsfindr-api](https://github.com/rewardsfindr/rewardsfindr-api)** - Backend API (coming soon)

## Development

### API Development
```bash
cd api
npm install
npm run dev
```

### Mobile Development
```bash
cd mobile
npm install
npm start
```

### Extension Development
```bash
cd extension
npm install
npm run build
# Load unpacked extension in Chrome from extension/dist
```

## Testing

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:shared
npm run test:extension
```

## Tech Stack

- **Frontend:** React, React Native
- **Backend:** Node.js, Express, Firebase/Firestore
- **Deployment:** Vercel (web), Firebase (backend)
- **Testing:** Jest

## Contributing

All changes must go through a pull request. Direct commits to main are not allowed.

## Contact

📧 hello@rewardsfindr.com
