import { HttpError } from '@fudic/http';
import { maintenance } from 'fudic:middlewares/maintenance';
import { isClosed } from './status';

maintenance.server((ctx, next) => {
  if (isClosed()) throw new HttpError({ status: 503, title: 'Service Unavailable', detail: 'Back in five minutes.' });
  return next(ctx);
});
