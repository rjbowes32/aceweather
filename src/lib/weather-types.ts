export type WeatherPayload = {
  generatedAt: string;
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
          pressure_msl: number;
          weather_code: number;
          wind_speed_10m: number;
          wind_gusts_10m: number;
        };
        hourly: {
          time: string[];
          temperature_2m: Array<number | null>;
          precipitation: Array<number | null>;
          precipitation_probability?: Array<number | null>;
          weather_code: Array<number | null>;
        };
        daily: {
          time: string[];
          weather_code: Array<number | null>;
          temperature_2m_min: Array<number | null>;
          temperature_2m_max: Array<number | null>;
          precipitation_sum: Array<number | null>;
          precipitation_probability_max?: Array<number | null>;
          wind_speed_10m_max: Array<number | null>;
        };
      };
      history: {
        daily: {
          time: string[];
          temperature_2m_max: Array<number | null>;
          temperature_2m_min: Array<number | null>;
          precipitation_sum: Array<number | null>;
        };
      };
      climateWindow: {
        summary: {
          averageMonthlyRain: number;
          currentMonthRain: number;
          sampleYears: number;
          progressPctCapped: number;
        };
      };
      airQuality: {
        current: {
          european_aqi: number | null;
          us_aqi: number | null;
          pm2_5: number | null;
          pm10: number | null;
          nitrogen_dioxide: number | null;
          ozone: number | null;
        };
      };
    };
    ecmwf: {
      enabled: boolean;
      reason?: string;
    };
    meteomatics: {
      enabled: boolean;
      reason?: string;
    };
  };
  agronomy: {
    summary: {
      fieldAccessScore: number;
      fieldAccessLabel: string;
      rainLast7Days: number;
      rainNext7Days: number;
      soilMoistureSurface: number;
      windNow: number;
      gustNow: number;
      dataSources: {
        rainLast7Days: string;
        windNow: string;
        gustNow: string;
        soilMoistureSurface: string;
      };
    };
    sprayWindow: {
      openHoursNext24: number;
      longestBlockHours: number;
      riskLabel: string;
    };
    diseaseModels: {
      generalFungalPressure: {
        score: number;
        label: string;
        basis: string;
      };
      lateBlightSmithProxy: {
        triggered: boolean;
        label: string;
        basis: string;
      };
      septoriaProxy: {
        score: number;
        label: string;
        basis: string;
      };
    };
    inputQuality: {
      score: number;
      label: string;
      drivers: string[];
    };
    disclaimer: string;
  };
};
