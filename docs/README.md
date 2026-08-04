# TCET Coding Platform Documentation

This directory contains the maintained documentation for the TCET Coding Platform. It is split between a student-facing guide and technical reference modules for reviewers, operators, and maintainers.

## Student Guide

- [TCET Coding Platform User Guide (PDF)](TCET_Coding_Platform_User_Guide.pdf) — onboarding, profile completion, practice problems, contests, leaderboards, and personal performance analytics.

## Technical Documentation

The technical documentation is organised as seven standalone LaTeX modules. Each source file can be compiled independently in a LaTeX environment such as Overleaf.

| Module | Document | Purpose |
| --- | --- | --- |
| 1 | [Introduction and System Overview](Module1_Introduction.tex) | Product vision, scope, stakeholders, requirements, and terminology. |
| 2 | [System Architecture](Module2_Architecture.tex) | Application topology, technology choices, trust boundaries, and system design. |
| 3 | [Security and Data](Module3_Security_Data.tex) | Authentication, authorization, security controls, and persistence. |
| 4 | [Execution Engine](Module4_Execution.tex) | Problems, submissions, asynchronous judging, and multi-language execution. |
| 5 | [Contest and Assessment Engine](Module5_Contest.tex) | Contest lifecycle, grading, feedback, standings, and assessment behavior. |
| 6 | [Proctoring](Module6_Proctoring.tex) | Academic-integrity controls, violation handling, and proctoring workflows. |
| 7 | [Deployment and Future Scope](Module7_Deployment_Future.tex) | Infrastructure, deployment, operations, governance, and planned evolution. |

For repository setup, development, operations, and API guidance, see the [root README](../README.md).
