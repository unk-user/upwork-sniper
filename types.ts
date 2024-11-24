export type Job = {
  uid: string;
  title: string;
  description: string;
  jobType: string;
  experienceLevel: string;
  publishedAt: string;
  fixedPrice: string;
  duration: string;
  skills: string[];
};

export type ResponseData = Job[];
