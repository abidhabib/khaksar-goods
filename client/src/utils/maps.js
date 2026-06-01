export const normalizeCoordinates = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().replace(/\s+/g, '');
  const parts = normalized.split(',');
  if (parts.length !== 2) {
    return null;
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return `${latitude},${longitude}`;
};

export const buildGoogleMapsUrl = (coordinates) => {
  const normalized = normalizeCoordinates(coordinates);
  return normalized ? `https://www.google.com/maps?q=${encodeURIComponent(normalized)}` : null;
};
