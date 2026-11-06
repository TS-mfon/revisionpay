import type { Requirement } from "./index";

export type TestPageVersion = "baseline" | "incomplete" | "corrected";
export interface SamplePage {
  headline: string;
  description: string;
  detail: string;
  cta: string;
  href: string;
}
export interface AgreementTemplate {
  id: string;
  name: string;
  summary: string;
  clientName: string;
  amountMinor: number;
  requirements: Requirement[];
  page: {
    brand: string;
    category: string;
    original: SamplePage;
    revised: SamplePage;
    incompleteDetail: string;
  };
}

export const AGREEMENT_TEMPLATES: AgreementTemplate[] = [
  {
    id: "pricing-trial",
    name: "Clarify a pricing page",
    summary: "Make the trial, monthly price and signup link clear.",
    clientName: "Northstar Studio",
    amountMinor: 18000,
    requirements: [
      {
        id: "R1",
        title: "Explain the free trial",
        description:
          "State that the free trial lasts 14 days, requires no credit card and does not charge automatically when it ends.",
      },
      {
        id: "R2",
        title: "Keep monthly billing",
        description:
          "Keep the price at $29 per month and say customers can cancel anytime, with no annual commitment or cancellation fee.",
      },
      {
        id: "R3",
        title: "Link to the trial",
        description:
          "Label the primary button ‘Start your free trial’ and link it to #start-trial on this page. Only the wording and link target are in scope.",
      },
    ],
    page: {
      brand: "Northstar",
      category: "A calmer workspace for your team",
      original: {
        headline: "Space for your next big idea.",
        description:
          "Bring your projects, notes and team together in one place.",
        detail: "$29 per month. Contact us for trial and cancellation details.",
        cta: "Buy now",
        href: "#plans",
      },
      revised: {
        headline: "Space for your next big idea.",
        description:
          "Try Northstar free for 14 days. No credit card required, and no automatic charge when your trial ends.",
        detail:
          "$29 per month, billed monthly. Cancel anytime. No annual commitment or cancellation fee.",
        cta: "Start your free trial",
        href: "#start-trial",
      },
      incompleteDetail:
        "$29 per month, billed annually with a 12-month commitment and a $99 cancellation fee.",
    },
  },
  {
    id: "portfolio-contact",
    name: "Improve a portfolio contact page",
    summary: "Explain the offer and help potential clients get in touch.",
    clientName: "Maya Design Studio",
    amountMinor: 12000,
    requirements: [
      {
        id: "R1",
        title: "Name the services",
        description:
          "Clearly state that Maya Design Studio offers brand identity and website design for small businesses.",
      },
      {
        id: "R2",
        title: "Set response expectations",
        description:
          "Promise a reply within two business days and describe the first consultation as free, with no booking fee.",
      },
      {
        id: "R3",
        title: "Make contact easy",
        description:
          "Label the primary link ‘Discuss your project’ and set its destination to mailto:hello@maya.example. Only the wording and link target are in scope; the example mailbox does not receive mail.",
      },
    ],
    page: {
      brand: "Maya Design Studio",
      category: "Thoughtful design for growing businesses",
      original: {
        headline: "Let's make something memorable.",
        description: "Independent creative work, made with care.",
        detail: "Get in touch to learn about our process and availability.",
        cta: "View our work",
        href: "#work",
      },
      revised: {
        headline: "Brand identity and website design for small businesses.",
        description:
          "Let's turn your next idea into a clear, confident brand and website.",
        detail:
          "We reply within two business days. Your first consultation is free, with no booking fee.",
        cta: "Discuss your project",
        href: "mailto:hello@maya.example",
      },
      incompleteDetail:
        "We reply within two business days. A $50 booking fee is required for your first consultation.",
    },
  },
  {
    id: "delivery-returns",
    name: "Explain delivery and returns",
    summary: "Give shoppers clear delivery costs and return conditions.",
    clientName: "Linen & Clay",
    amountMinor: 15000,
    requirements: [
      {
        id: "R1",
        title: "Explain dispatch times",
        description:
          "State that orders are dispatched within three business days and that dispatch time is separate from delivery time.",
      },
      {
        id: "R2",
        title: "State shipping and returns",
        description:
          "State that US standard shipping is $5, orders of $75 or more ship free, and unused items can be returned within 30 days of delivery.",
      },
      {
        id: "R3",
        title: "Point to return instructions",
        description:
          "Label the primary link ‘How to return an item’ and point it to #return-steps on this page. Only copy and the link destination are in scope.",
      },
    ],
    page: {
      brand: "Linen & Clay",
      category: "Everyday objects, thoughtfully made",
      original: {
        headline: "Good things are on their way.",
        description: "We pack every order with care. Shipping times vary.",
        detail:
          "Shipping is calculated later. Contact us if your order is not right.",
        cta: "Keep shopping",
        href: "#collection",
      },
      revised: {
        headline: "Delivery and returns, made clear.",
        description:
          "Orders are dispatched within three business days. Dispatch time is separate from delivery time.",
        detail:
          "US standard shipping is $5, or free on orders of $75 or more. Return unused items within 30 days of delivery.",
        cta: "How to return an item",
        href: "#return-steps",
      },
      incompleteDetail:
        "US standard shipping is $5, or free on orders of $75 or more. All sales are final; returns are not accepted.",
    },
  },
  {
    id: "webinar-signup",
    name: "Clarify a webinar signup",
    summary: "Set the session time, price and recording expectations.",
    clientName: "Launch School",
    amountMinor: 9500,
    requirements: [
      {
        id: "R1",
        title: "Give the time and timezone",
        description:
          "State that the live ‘Launch your first website’ webinar takes place every Thursday at 4:00 PM UTC and lasts 60 minutes.",
      },
      {
        id: "R2",
        title: "Make access clear",
        description:
          "State that registration is free, no payment card is required and everyone who registers receives the recording within 24 hours.",
      },
      {
        id: "R3",
        title: "Link to registration",
        description:
          "Label the primary button ‘Reserve my free seat’ and point it to #register on this page. The form and email delivery are outside the revision scope.",
      },
    ],
    page: {
      brand: "Launch School",
      category: "Small steps. Real progress.",
      original: {
        headline: "Launch your first website.",
        description:
          "Join our next live workshop and learn how to get your idea online.",
        detail:
          "Session times and access details are shared after registration.",
        cta: "Learn more",
        href: "#about",
      },
      revised: {
        headline: "Launch your first website.",
        description:
          "Join the live webinar every Thursday at 4:00 PM UTC. The session lasts 60 minutes.",
        detail:
          "Registration is free, with no payment card required. Everyone who registers receives the recording within 24 hours.",
        cta: "Reserve my free seat",
        href: "#register",
      },
      incompleteDetail:
        "Registration is free, with no payment card required. Recordings are only available to paid members.",
    },
  },
  {
    id: "restaurant-booking",
    name: "Simplify restaurant bookings",
    summary: "Explain opening hours, group size and how to book.",
    clientName: "Olive Table",
    amountMinor: 8500,
    requirements: [
      {
        id: "R1",
        title: "Show dinner hours",
        description:
          "State that dinner is served Tuesday through Saturday from 5:00 PM to 10:00 PM, and the restaurant is closed on Sundays and Mondays.",
      },
      {
        id: "R2",
        title: "Clarify group bookings",
        description:
          "Explain that online reservations accept parties of one to six guests and that no deposit is required.",
      },
      {
        id: "R3",
        title: "Use a clear booking link",
        description:
          "Label the primary button ‘Book a table’ and link it to #reservations on this page. The booking system itself is outside scope.",
      },
    ],
    page: {
      brand: "Olive Table",
      category: "A good evening starts around the table",
      original: {
        headline: "Seasonal food. Familiar faces.",
        description: "Come over for dinner. Get in touch for our latest hours.",
        detail:
          "Ask our team about reservations, group sizes and booking terms.",
        cta: "Explore",
        href: "#menu",
      },
      revised: {
        headline: "Seasonal food. Familiar faces.",
        description:
          "Dinner is served Tuesday through Saturday, 5:00 PM to 10:00 PM. Closed Sundays and Mondays.",
        detail:
          "Book online for parties of one to six guests. No deposit is required.",
        cta: "Book a table",
        href: "#reservations",
      },
      incompleteDetail:
        "Book online for parties of one to six guests. A $20 deposit per guest is required.",
    },
  },
];

export function agreementTemplate(id: string) {
  return AGREEMENT_TEMPLATES.find((template) => template.id === id);
}

export function templatePage(
  template: AgreementTemplate,
  version: TestPageVersion,
): SamplePage {
  if (version === "baseline") return { ...template.page.original };
  return {
    ...template.page.revised,
    ...(version === "incomplete"
      ? { detail: template.page.incompleteDetail }
      : {}),
  };
}
