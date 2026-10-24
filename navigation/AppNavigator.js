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
import PendingOrdersScreen from '../screens/PendingOrdersScreen';
import PhoneScreen from '../screens/PhoneScreen';
import CallAttendantScreen from '../screens/CallAttendantScreen';
import AttendantConfirmScreen from '../screens/AttendantConfirmScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      {/* cardStyle flex: 1 prende cada tela na altura da janela no navegador;
          sem isso o stack deixa a pagina crescer e o body (overflow hidden) corta o rodape */}
      <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { flex: 1 } }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="EnterCode" component={SelectGroupScreen} />
        <Stack.Screen name="PhotoGallery" component={PhotoGalleryScreen} />
        <Stack.Screen name="PackageSelect" component={PackageSelectScreen} />
        <Stack.Screen name="SelectPhotos" component={SelectPhotosScreen} />
        <Stack.Screen name="Extras" component={ExtrasScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="CallAttendant" component={CallAttendantScreen} />
        <Stack.Screen name="AttendantConfirm" component={AttendantConfirmScreen} />
        <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="PendingOrders" component={PendingOrdersScreen} />
        <Stack.Screen name="Phone" component={PhoneScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}