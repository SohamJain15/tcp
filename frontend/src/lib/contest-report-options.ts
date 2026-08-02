export interface ContestReportSections {
  narrative: boolean;
  questionBreakdown: boolean;
  languageEfficiency: boolean;
  optimalCode: boolean;
  proctoring: boolean;
}

export const DEFAULT_REPORT_SECTIONS: ContestReportSections = {
  narrative: true,
  questionBreakdown: true,
  languageEfficiency: true,
  optimalCode: true,
  proctoring: true,
};
