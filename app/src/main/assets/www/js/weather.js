/* ============================================================
 * weather.js — Cuaca via Open-Meteo (gratis, tanpa API key)
 * https://open-meteo.com/ — current + daily 3 hari
 * ============================================================ */
(function (root) {
  'use strict';

  const WMO = {
    0: ['Cerah', '☀️'], 1: ['Cerah Berawan', '🌤️'], 2: ['Berawan Sebagian', '⛅'],
    3: ['Berawan', '☁️'], 45: ['Berkabut', '🌫️'], 48: ['Kabut Beku', '🌫️'],
    51: ['Gerimis Ringan', '🌦️'], 53: ['Gerimis', '🌦️'], 55: ['Gerimis Lebat', '🌧️'],
    56: ['Gerimis Beku', '🌧️'], 57: ['Gerimis Beku Lebat', '🌧️'],
    61: ['Hujan Ringan', '🌦️'], 63: ['Hujan', '🌧️'], 65: ['Hujan Lebat', '⛈️'],
    66: ['Hujan Beku', '🌧️'], 67: ['Hujan Beku Lebat', '🌧️'],
    71: ['Salju Ringan', '🌨️'], 73: ['Salju', '🌨️'], 75: ['Salju Lebat', '❄️'],
    77: ['Butiran Salju', '🌨️'],
    80: ['Hujan Lokal Ringan', '🌦️'], 81: ['Hujan Lokal', '🌧️'], 82: ['Hujan Lokal Lebat', '⛈️'],
    85: ['Hujan Salju Ringan', '🌨️'], 86: ['Hujan Salju', '🌨️'],
    95: ['Badai Petir', '⛈️'], 96: ['Badai Petir + Es', '⛈️'], 99: ['Badai Petir + Es Lebat', '⛈️'],
  };

  function describe(code) {
    return WMO[code] || ['Tidak diketahui', '🌡️'];
  }

  /**
   * Ambil cuaca terkini + prakiraan 3 hari.
   * @returns {Promise<{current:object, daily:object, utcOffsetSeconds:number}>}
   */
  async function fetchWeather(lat, lon) {
    const url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&forecast_days=3&timezone=auto';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Open-Meteo HTTP ' + res.status);
    const j = await res.json();
    return {
      current: {
        temp: j.current.temperature_2m,
        feels: j.current.apparent_temperature,
        humidity: j.current.relative_humidity_2m,
        code: j.current.weather_code,
        wind: j.current.wind_speed_10m,
        windDir: j.current.wind_direction_10m,
        ...describe(j.current.weather_code),
      },
      daily: (j.daily.time || []).map((t, i) => ({
        date: t,
        code: j.daily.weather_code[i],
        tmax: j.daily.temperature_2m_max[i],
        tmin: j.daily.temperature_2m_min[i],
        rainProb: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[i] : null,
        ...describe(j.daily.weather_code[i]),
      })),
      utcOffsetSeconds: j.utc_offset_seconds,
    };
  }

  const Weather = { WMO, describe, fetchWeather };

  if (typeof module !== 'undefined' && module.exports) module.exports = Weather;
  else root.Weather = Weather;
})(typeof window !== 'undefined' ? window : globalThis);
