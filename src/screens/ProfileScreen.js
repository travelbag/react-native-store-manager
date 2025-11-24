import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";

const ProfileScreen = ({ navigation }) => {
  const { manager, logout } = useAuth();

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await removePushToken(manager.id, manager.storeId, manager.pushToken);
            logout();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                "https://ubgukf7hdu.us-east-1.awsapprunner.com/api/store-managers/deleteaccount",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ managerId: manager.id }),
                }
              );

              const data = await res.json();

              if (res.ok) {
                Alert.alert("Account Deleted", "Your account has been removed.");
                logout();
              } else {
                Alert.alert("Error", data.message || "Failed to delete account.");
              }
            } catch (error) {
              Alert.alert("Error", "Something went wrong.");
            }
          },
        },
      ]
    );
  };

  // Call this when logging out
  async function removePushTokenOnLogout(storeManagerId, storeId, pushToken) {
    try {
      const response = await fetch(
        `https://ubgukf7hdu.us-east-1.awsapprunner.com/api/store-managers/${storeManagerId}/remove-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, pushToken }),
        }
      );
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 28 }} />
      </View>

    {/* Profile Icon */}
    <View style={styles.profileIconContainer}>
    <Ionicons name="person-circle-outline" size={90} color="#51A2F8" />
    </View>

    {/* Profile Info */}
    <View style={styles.infoBox}>
    <View style={styles.row}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{manager?.name}</Text>
    </View>

    <View style={styles.separator} />

    <View style={styles.row}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{manager?.role || "Store Manager"}</Text>
    </View>
    </View>

      {/* Buttons */}
      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Text style={styles.deleteText}>Delete Account</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 50,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  profileIconContainer: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
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
