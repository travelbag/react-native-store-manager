# React Native Store Manager - Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Overview
This is a React Native Expo application designed for store managers to handle order management with real-time push notifications.

## Key Technologies
- React Native with Expo SDK 53
- React Navigation for navigation
- Expo Notifications for push notifications
- Context API for state management

## Code Style Guidelines
- Use functional components with React Hooks
- Follow React Native best practices for styling
- Use TypeScript-style prop validation where possible
- Implement proper error handling for async operations
- Use consistent naming conventions (camelCase for variables/functions, PascalCase for components)

## Architecture Patterns
- Context API for global state management (OrdersContext)
- Service layer for external API calls and notifications (NotificationService)
- Component composition with reusable UI components
- Screen-based navigation structure

## Notification Features
- Expo push notifications for real-time order updates
- Local notification fallbacks for development
- Proper permission handling for iOS and Android
- Background notification handling

## Order Management Features
- Real-time order tracking
- Order status updates (pending, accepted, preparing, ready, completed, rejected)
- Order filtering and search capabilities
- Analytics and reporting dashboard

## Development Notes
- Use `npx expo start` to run the development server
- Test push notifications on physical devices (required for Expo notifications)
- Follow Expo development best practices
- Implement proper error boundaries for production apps
