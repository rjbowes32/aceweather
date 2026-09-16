import { AtlasExperience } from "./atlas-experience";
import styles from "./atlas.module.css";

export const metadata = {
  title: "UK Crop Weather Atlas | AceWeather",
  description: "UK drought, weather and crop yield data.",
};

export default function AtlasPage() {
  return (
    <main className={styles.page}>
      <AtlasExperience />
    </main>
  );
}
