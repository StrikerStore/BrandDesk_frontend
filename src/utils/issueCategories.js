/**
 * Issue taxonomy — MUST stay character-for-character identical to the
 * `issueSubcategories` object in the Shopify Liquid contact form.
 *
 * Both the customer-facing form and the internal "Raise ticket for customer"
 * modal write into the same `threads.issue_category` / `threads.sub_issue`
 * columns, and analytics groups by them. If the two lists drift, the same
 * real-world issue splits into two buckets in every report.
 */
export const ISSUE_SUBCATEGORIES = {
  'Order & Delivery Issues': [
    'Order not delivered',
    'Delivery delayed',
    'Shipment stuck / no tracking updates',
    'Wrong product delivered',
    'Missing item in the package',
    'Package marked delivered but not received',
    'Other',
  ],

  'Product Quality & Size Issues': [
    'Size too small / too large',
    'Wrong size sent',
    'Color mismatch from website photos',
    'Defective or damaged product',
    'Poor print quality or stitching issues',
    'Fabric/material not as expected',
    'Other',
  ],

  'Returns, Exchanges & Refunds': [
    'Requesting a size exchange',
    'Returning due to defect',
    'Returning due to incorrect item',
    'Refund not received yet',
    'Exchange not picked up',
    'Return pickup failed / rescheduled',
    'Other',
  ],

  'Payment & Billing Problems': [
    'Payment failed but money deducted',
    'COD related issue',
    'Double payment',
    'Overcharged or incorrect billing',
    'Coupon or discount not applied',
    'Other',
  ],

  'Account & Login Issues': [
    'Unable to login',
    'Password reset not working',
    'OTP not received',
    'Email/phone not recognized',
    'Other',
  ],

  'Order Modification Requests': [
    'Changing size after order placement',
    'Changing shipping address',
    'Cancelling the order before dispatch',
    'Updating contact number',
    'Other',
  ],

  'Product Inquiry': [
    'Asking about size guide',
    'Material or fabric details',
    'Authenticity or quality queries',
    'Availability of a specific jersey',
    'Restock requests',
    'Other',
  ],

  'Tracking & Shipping Queries': [
    'Tracking link not working',
    'Courier partner issues',
    'Delivery area not serviceable',
    'Wanting faster delivery',
    'Other',
  ],

  'Miscellaneous / Other': [
    'Requesting invoice',
    'Feedback or complaint about courier',
    'Complaint about customer support experience',
    'General suggestions',
    'Other',
  ],
};

export const ISSUE_CATEGORIES = Object.keys(ISSUE_SUBCATEGORIES);
