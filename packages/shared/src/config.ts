import { Config, SubscriptionTier } from './types';

export const defaultConfig: Config = {
  quotaDailyLimit: 50,
  subscriptionSoftCap: 2000,
  subscriptionPeriodSeconds: 2_592_000,
  priceSubscription: {
    [SubscriptionTier.Free]: 0,
    [SubscriptionTier.Plus]: 399,
    [SubscriptionTier.Pro]: 899,
    [SubscriptionTier.Ultra]: 1599,
  },
  pricePack: {
    Story: 450,
    Memory: 120,
    Creator: 300,
  },
};
