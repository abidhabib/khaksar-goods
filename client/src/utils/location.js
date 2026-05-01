import { formatDistanceToNowStrict } from 'date-fns';

export const formatLocationSummary = (entity) => {
  const parts = [
    entity?.last_location_area,
    entity?.last_location_city,
    entity?.last_location_province
  ].filter(Boolean);

  if (parts.length) {
    return parts.join(', ');
  }

  return entity?.last_location_label || 'Location unavailable';
};

export const formatLocationAgo = (timestamp) => {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
};
