import { feature, item, plan } from 'atmn';

// Features
export const messages = feature({
	id: 'messages',
	name: 'Messages',
	type: 'metered',
	consumable: true
});

// Plans
export const pro = plan({
	id: 'pro',
	name: 'Pro',
	price: {
		amount: 20,
		interval: 'month'
	},
	items: [
		item({
			featureId: messages.id,
			included: 100,
			reset: {
				interval: 'month'
			}
		})
	]
});

export const freePlan = plan({
	id: 'free_plan',
	name: 'Free Plan',
	autoEnable: true,
	items: [
		item({
			featureId: messages.id,
			included: 5,
			reset: {
				interval: 'month'
			}
		})
	]
});
