"use client";

import { useState } from "react";
import type { AwModel } from "@/lib/aceweather/derive";
import type { WindUnit } from "@/lib/aceweather/format";
import { DiseaseCard, SeasonCard, SoilWaterCard, SprayCard } from "./cards";

type FieldSection = "spray" | "disease" | "soil" | "season";

type Props = {
  model: AwModel;
  windUnit: WindUnit;
};

export function FieldExperience({ model, windUnit }: Props) {
  const [section, setSection] = useState<FieldSection>("spray");
  const spraying = model.agronomy.spraying;
  const access = model.agronomy.access;
  const blight = model.agronomy.blight;
  const disease = model.agronomy.disease;
  const diseaseLabel = blight.status !== "Low" ? blight.status : disease.pressureLabel;
  const diseaseTone = blight.tone !== "go" ? blight.tone : disease.pressureTone;
  const tabs: Array<{ key: FieldSection; label: string; value: string; tone: string }> = [
    { key: "spray", label: "Spraying", value: spraying.verdict, tone: spraying.verdictTone },
    { key: "disease", label: "Disease", value: diseaseLabel, tone: diseaseTone },
    { key: "soil", label: "Workability", value: access.label, tone: access.tone },
    { key: "season", label: "Operations", value: `${model.agronomy.gdd.next14} GDD`, tone: "cool" },
  ];

  return (
    <section className="awx-field-experience" aria-label="Field guidance">
      <div className="awx-field-switcher" role="group" aria-label="Field sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={section === tab.key}
            className={`awx-field-switch awx-field-switch-${tab.tone}`}
            onClick={() => setSection(tab.key)}
          >
            <span>{tab.label}</span>
            <strong>{tab.value}</strong>
          </button>
        ))}
      </div>

      <div className="awx-field-panel" role="region" aria-label={`${tabs.find((tab) => tab.key === section)?.label} details`}>
        {section === "spray" ? <SprayCard model={model} windUnit={windUnit} /> : null}
        {section === "disease" ? <DiseaseCard model={model} /> : null}
        {section === "soil" ? <SoilWaterCard model={model} /> : null}
        {section === "season" ? <SeasonCard model={model} /> : null}
      </div>
    </section>
  );
}
