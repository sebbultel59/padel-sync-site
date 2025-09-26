// app/invite/[code].js
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function InviteAlias() {
  const { code } = useLocalSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Redirige vers /join?code=ABC123
    if (code) router.replace({ pathname: "/join", params: { code } });
  }, [code]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}