import nishantImage from "../assets/team/nishant.png";
import yusraImage from "../assets/team/yusra.png";
import umamImage from "../assets/team/umam.png";

export const aboutTeam = {
  investmentLead: {
    name: "Nishant Jain",
    role: "Independent Equity Investor & Researcher",
    credentials: ["IIT Kanpur", "CFA Level I Cleared", "NISM Certified Research Analyst"],
    image: {
      src: nishantImage,
      alt: "Portrait of Nishant Jain",
      objectPosition: "50% 28%",
    },
    bio: "Nishant’s investment approach is rooted in fundamental research, business quality, valuation discipline, margin of safety, thoughtful position sizing and long-term compounding.",
  },
  technologyTeam: [
    {
      name: "Yusra Khan",
      role: "Software Engineer",
      image: {
        src: yusraImage,
        alt: "Portrait of Yusra Khan",
        objectPosition: "50% 27%",
      },
      bio: "Contributes to the design, development and ongoing improvement of the platform, with a focus on a clear and intuitive digital experience.",
    },
    {
      name: "Mohd Umam Siddiqui",
      role: "Software Engineer",
      image: {
        src: umamImage,
        alt: "Portrait of Mohd Umam Siddiqui",
        objectPosition: "50% 25%",
      },
      bio: "Contributes to the development and maintenance of the platform, helping keep the digital experience reliable, accessible and easy to use.",
    },
  ],
};

export const aboutPillars = [
  { title: "Research", text: "Fundamental, sectoral and company-level analysis built around business quality, valuation and long-term opportunity." },
  { title: "Portfolio Thinking", text: "A disciplined view of conviction, allocation, diversification, risk and long-term portfolio construction." },
  { title: "Investor Understanding", text: "Helping investors better understand businesses, markets, portfolio decisions and the reasoning behind investment choices." },
  { title: "Global Perspective", text: "Exploring domestic and international opportunities, including equities, ETFs and broader market exposure." },
];

export const aboutPrinciples = [
  { title: "Independent Thinking", text: "Research before consensus." },
  { title: "Clarity Over Complexity", text: "Investment reasoning should be understandable, structured and evidence-led." },
  { title: "Discipline Over Noise", text: "Process, risk management and long-term thinking matter more than short-term market excitement." },
];
