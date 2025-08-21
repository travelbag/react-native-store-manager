# React Native Store Manager - Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Overview
This is a React Native Expo application designed for grocery store managers to handle order management with real-time push notifications, barcode scanning, and rack navigation for efficient order picking.

## Key Technologies
- React Native with Expo SDK 53
- React Navigation (nested stack and tab navigators)
- Expo Notifications for push notifications
- Expo Barcode Scanner for product verification
- Expo Camera for barcode scanning
- Context API for state management

## Code Style Guidelines
- Use functional components with React Hooks
- Follow React Native best practices for styling
- Use TypeScript-style prop validation where possible
- Implement proper error handling for async operations and camera access
- Use consistent naming conventions (camelCase for variables/functions, PascalCase for components)

## Architecture Patterns
- Context API for global state management (OrdersContext with item-level tracking)
- Service layer for external API calls and notifications (NotificationService)
- Component composition with reusable UI components
- Nested navigation structure (Tab → Stack → Screens)

## Grocery Store Features
- Real-time grocery order notifications with product images and details
- Barcode scanning for product verification during picking
- Rack navigation system with store layout integration
- Item-by-item picking workflow with progress tracking
- Order status management (pending → accepted → picking → preparing → ready → completed)

## Notification Features
- Expo push notifications for real-time grocery order updates
- Local notification fallbacks for development
- Proper permission handling for iOS and Android
- Background notification handling
- Grocery-specific notification content with item counts

## Order Management Features
- Real-time grocery order tracking with product images
- Order status updates with grocery-specific workflow
- Order filtering and search capabilities
- Analytics and reporting dashboard for grocery metrics
- Barcode scanning integration for order fulfillment
- Rack location system for efficient store navigation

## Development Notes
- Use `npx expo start` to run the development server
- Test push notifications on physical devices (required for Expo notifications)
- Test barcode scanner on physical devices (camera access required)
- Follow Expo development best practices
- Implement proper error boundaries for production apps
- Handle camera permissions properly for barcode scanning
