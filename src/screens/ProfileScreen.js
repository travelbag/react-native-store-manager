import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { confirmAppDialog, showAppDialog } from "../context/DialogContext";
import { apiClient } from "../services/apiClient";

const ProfileScreen = () => {
  const { manager, logout } = useAuth();

  const handleSignOut = async () => {
    const confirmed = await confirmAppDialog({
      title: 'Sign out',
      message: 'You will need your username and password to sign back in.',
      confirmText: 'Sign Out',
      destructive: true,
      icon: 'log-out-outline',
    });
    if (!confirmed) return;

    await removePushTokenOnLogout(manager?.id, manager?.storeId, manager?.pushToken);
    await logout();
  };

  async function removePushTokenOnLogout(storeManagerId, storeId, pushToken) {
    if (!storeManagerId || !storeId || !pushToken) {
      return;
    }

    try {
      const response = await apiClient.post(`/store-managers/${storeManagerId}/remove-token`, {
        body: { storeId, pushToken },
      });
      const result = await response.json();
      if (response.ok) {
        console.log('Push token removed:', result.message);
      } else {
        console.warn('Failed to remove push token:', result.message);
      }
    } catch (e) {
      console.error('Error removing push token:', e);
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = await confirmAppDialog({
      title: "Delete account",
      message: "This permanently removes your store manager account. This action cannot be undone.",
      confirmText: "Delete",
      destructive: true,
      icon: "trash-outline",
    });
    if (!confirmed) return;

    try {
      const res = await apiClient.post("/store-managers/deleteaccount", {
        body: { managerId: manager.id },
      });

      const data = await res.json();

      if (res.ok) {
        await showAppDialog("Account deleted", "Your account has been removed.", undefined, {
          variant: "success",
        });
        logout();
      } else {
        showAppDialog("Delete failed", data.message || "Failed to delete account.", undefined, {
          variant: "error",
        });
      }
    } catch (error) {
      showAppDialog("Something went wrong", "Please check your connection and try again.", undefined, {
        variant: "error",
      });
    }
  };

  return (
    <SafeAreaView style={styles.outer} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <View style={styles.profileIconContainer}>
          <Ionicons name="person-circle-outline" size={90} color="#51A2F8" />
        </View>

        <View style={styles.infoBox}>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{manager?.name}</Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.row}>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>
              {String(manager?.role || '').toLowerCase() === 'employee' ? 'Employee' : 'Picker'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  profileIconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: "#F8F9FB",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  label: {
    fontSize: 16,
    color: "#555",
    fontWeight: "500",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  separator: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: 8,
  },
  deleteButton: {
    backgroundColor: "#ff3b30",
    padding: 15,
    borderRadius: 10,
    marginTop: 50,
  },
  deleteText: {
    textAlign: "center",
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  logoutText: {
    textAlign: "center",
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default ProfileScreen;
