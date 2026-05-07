export type WeatherPayload = {
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  providers: {
    openMeteo: {
      forecast: {
        current: {
          temperature_2m: number;
          apparent_temperature: number;
          relative_humidity_2m: number;
          precipitation: number;
          wind_speed_10m: number;
          wind_gusts_10m: number;
        };
        daily: {
          time: string[];
          temperature_2m_max: Array<number | null>;
          precipitation_sum: Array<number | null>;
        };
      };
    };
  };
  agronomy: {
    summary: {
      fieldAccessScore: number;
      fieldAccessLabel: string;
      rainLast7Days: number;
      rainNext7Days: number;
    };
    sprayWindow: {
      openHoursNext24: number;
      riskLabel: string;
    };
    diseaseModels: {
      generalFungalPressure: {
        score: number;
        label: string;
      };
      lateBlightSmithProxy: {
        triggered: boolean;
        label: string;
      };
      septoriaProxy: {
        score: number;
        label: string;
      };
    };
  };
};
