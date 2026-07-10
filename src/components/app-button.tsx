import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type Variant = "default" | "danger" | "success" | "ghost";

interface AppButtonProps extends PressableProps {
  label: string;
  variant?: Variant;
  disabled?: boolean;
}

export function AppButton({ label, variant = "default", disabled, style, ...rest }: AppButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      style={[
        styles.base,
        variant === "danger" && styles.danger,
        variant === "success" && styles.success,
        variant === "ghost" && styles.ghost,
        disabled && styles.disabled,
        style as any,
      ]}
      {...rest}>
      <ThemedText type="code" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: "#141516",
    borderWidth: 1,
    borderColor: "#2E3135",
    alignItems: "center",
    justifyContent: "center",
  },
  danger: {
    backgroundColor: "#1A1010",
    borderColor: "#5A2A2A",
  },
  success: {
    backgroundColor: "#101A12",
    borderColor: "#2A4A2E",
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  disabled: { opacity: 0.4 },
  label: { color: "#EDEDED" },
});