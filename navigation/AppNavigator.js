import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import WelcomeScreen from '../screens/WelcomeScreen';
import SelectGroupScreen from '../screens/SelectGroupScreen';
import PhotoGalleryScreen from '../screens/PhotoGalleryScreen';
import PackageSelectScreen from '../screens/PackageSelectScreen';
import SelectPhotosScreen from '../screens/SelectPhotosScreen';
import ExtrasScreen from '../screens/ExtrasScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import PaymentScreen from '../screens/PaymentScreen';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import PhoneScreen from '../screens/PhoneScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="EnterCode" component={SelectGroupScreen} />
        <Stack.Screen name="PhotoGallery" component={PhotoGalleryScreen} />
        <Stack.Screen name="PackageSelect" component={PackageSelectScreen} />
        <Stack.Screen name="SelectPhotos" component={SelectPhotosScreen} />
        <Stack.Screen name="Extras" component={ExtrasScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="Phone" component={PhoneScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}