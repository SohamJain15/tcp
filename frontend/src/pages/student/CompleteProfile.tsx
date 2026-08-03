import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";

import { userApi } from "@/api/services";
import { DEPARTMENTS, type CompleteProfilePayload, type Department } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UID_REGEX, parseUid, departmentsForUid } from "@/lib/uid";

const optionalUrlSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^https?:\/\/.+/i.test(value), "Enter a valid URL");

const studentProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  department: z.enum(DEPARTMENTS),
  uid: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value.length > 0, "UID is required")
    .refine((value) => !value.toLowerCase().includes("mock"), "Enter your real UID")
    .refine((value) => UID_REGEX.test(value), "Invalid format. Expected YY-BRANCHDIVROLL-YY, e.g. 24-AIDSA51-28"),
  // No semester field: the server derives it from the UID and refreshes it on every login,
  // so a value sent from here would be ignored anyway.
  linkedInUrl: optionalUrlSchema,
  githubUrl: optionalUrlSchema,
});

const DESIGNATIONS = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer"] as const;

const facultyProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  department: z.enum(DEPARTMENTS),
  designation: z.enum(DESIGNATIONS, { required_error: "Designation is required" }),
  linkedInUrl: optionalUrlSchema,
  githubUrl: optionalUrlSchema,
  // HOD status is no longer self-declared — it is provided by the trusted CoE
  // login payload (`isHod`) and applied automatically on every sign-in.
});

type StudentProfileFormValues = z.infer<typeof studentProfileSchema>;
type FacultyProfileFormValues = z.infer<typeof facultyProfileSchema>;

function toNullableUrl(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

const UID_TOKENS = [
  { token: "24", label: "admission year", accent: "text-primary" },
  { token: "-", label: null, accent: "text-muted-foreground" },
  { token: "AIDS", label: "branch", accent: "text-accent" },
  { token: "A", label: "division", accent: "text-gold" },
  { token: "51", label: "roll no", accent: "text-success" },
  { token: "-", label: null, accent: "text-muted-foreground" },
  { token: "28", label: "passout year", accent: "text-primary" },
] as const;

function TerminalPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hover-lift border border-border bg-card shadow-card">
      <div className="bg-gradient-hero flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="h-2.5 w-2.5 bg-accent" aria-hidden />
        <span className="h-2.5 w-2.5 bg-gold" aria-hidden />
        <span className="h-2.5 w-2.5 bg-success" aria-hidden />
        <span className="font-mono-code ml-2 text-xs text-primary-foreground/90">{title}</span>
      </div>
      <div className="font-mono-code space-y-4 p-4 text-sm">{children}</div>
    </div>
  );
}

function StudentUidPanel({ uid }: { uid: string }) {
  const parsed = parseUid(uid);

  return (
    <TerminalPanel title="~/tcet/profile.init — uid_spec">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">// UID format</div>
        <div className="mt-2 text-muted-foreground">
          <span className="text-primary">admission_year</span>
          <span> - </span>
          <span className="text-accent">branch</span>
          <span className="text-muted-foreground">+</span>
          <span>div</span>
          <span className="text-muted-foreground">+</span>
          <span>rollno</span>
          <span> - </span>
          <span className="text-primary">passout_year</span>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">// example</div>
        <div className="mt-2 flex flex-wrap items-end gap-x-1 gap-y-3 text-lg font-semibold">
          {UID_TOKENS.map((part, index) => (
            <span key={`${part.token}-${index}`} className="flex flex-col items-center gap-1">
              <span className={part.accent}>{part.token}</span>
              {part.label && (
                <span className="text-[9px] font-normal uppercase tracking-wide text-muted-foreground">
                  {part.label}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">// live parse</div>
        {parsed ? (
          <pre className="mt-2 overflow-x-auto text-xs leading-relaxed">
            <span className="text-muted-foreground">const</span> student = {"{"}
            {"\n"}  admissionYear: <span className="text-primary">"20{parsed.admissionYear}"</span>,
            {"\n"}  branch:        <span className="text-accent">"{parsed.branch}"</span>,
            {"\n"}  division:      <span className="text-accent">"{parsed.division}"</span>,
            {"\n"}  rollNumber:    <span className="text-success">{Number(parsed.rollNumber)}</span>, <span className="text-muted-foreground">// auto-derived</span>
            {"\n"}  passoutYear:   <span className="text-primary">"20{parsed.passoutYear}"</span>,
            {"\n"}{"}"};
          </pre>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">// waiting for a valid UID…</div>
        )}
      </div>
    </TerminalPanel>
  );
}

function FacultyPanel({ name, designation, department }: { name: string; designation: string; department?: string }) {
  return (
    <TerminalPanel title="~/tcet/profile.init — faculty">
      <pre className="overflow-x-auto text-xs leading-relaxed">
        <span className="text-muted-foreground">const</span> faculty = {"{"}
        {"\n"}  name:        <span className="text-primary">"{name || "…"}"</span>,
        {"\n"}  designation: <span className="text-accent">"{designation || "…"}"</span>,
        {"\n"}  department:  <span className="text-accent">"{department ?? "…"}"</span>,
        {"\n"}{"}"};
      </pre>
      <div className="whitespace-pre-line border-t border-border pt-4 text-xs text-muted-foreground">
        {"// Complete your profile to unlock the faculty dashboard,\n// problem authoring and contest management."}
      </div>
    </TerminalPanel>
  );
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: userData, isLoading } = useQuery({
    queryKey: ["complete-profile", "me"],
    queryFn: () => userApi.me("/complete-profile"),
    retry: false,
  });

  const role = userData?.user.role ?? "STUDENT";
  const isFaculty = role === "FACULTY";

  // The UID comes from the trusted CoE login payload — auto-filled and locked, and
  // it dictates which department(s) the student may pick.
  const payloadUid = (userData?.user.uid ?? "").trim();
  const uidLocked = payloadUid.length > 0 && parseUid(payloadUid) !== null;
  const uidDepartments = uidLocked ? (departmentsForUid(payloadUid) as Department[]) : [];
  const studentDepartmentOptions: Department[] = uidDepartments.length > 0 ? uidDepartments : DEPARTMENTS;
  // Ten of the eleven branch codes name exactly one department, so for almost every student
  // there is nothing to choose — only IOT covers two programmes (IoT and CSE-IOT).
  const departmentIsSettled = uidDepartments.length === 1;
  const defaultStudentDepartment: Department | undefined = departmentIsSettled
    ? uidDepartments[0]
    : (userData?.user.department as Department | undefined);

  const studentForm = useForm<StudentProfileFormValues>({
    resolver: zodResolver(studentProfileSchema),
    defaultValues: {
      name: userData?.user.name ?? "",
      uid: userData?.user.uid ?? "",
      department: defaultStudentDepartment,
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
    values: {
      name: userData?.user.name ?? "",
      uid: userData?.user.uid ?? "",
      department: defaultStudentDepartment,
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
  });

  const facultyForm = useForm<FacultyProfileFormValues>({
    resolver: zodResolver(facultyProfileSchema),
    defaultValues: {
      name: userData?.user.name ?? "",
      department: userData?.user.department ?? undefined,
      designation: (userData?.user.designation ?? undefined) as (typeof DESIGNATIONS)[number] | undefined,
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
    values: {
      name: userData?.user.name ?? "",
      department: userData?.user.department ?? undefined,
      designation: (userData?.user.designation ?? undefined) as (typeof DESIGNATIONS)[number] | undefined,
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CompleteProfilePayload) => userApi.updateProfile(payload, "/complete-profile"),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["complete-profile", "me"] });
      toast.success("Profile completed");
      navigate(response.user.role === "FACULTY" ? "/faculty/dashboard" : "/student/dashboard", {
        replace: true,
      });
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to save profile");
    },
  });

  const studentUid = studentForm.watch("uid");
  const facultyName = facultyForm.watch("name");
  const facultyDesignation = facultyForm.watch("designation");
  const facultyDepartment = facultyForm.watch("department");
  const isStudentSaveDisabled = saveMutation.isPending || studentUid.trim().length === 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your profile…
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-6xl px-4 py-10">
        <div className="mb-8">
          <div className="font-mono-code text-xs uppercase tracking-widest text-accent">
            {"//"} step 1 of 1 — profile.init()
          </div>
          <h1 className="mt-2 font-display text-4xl font-bold">Complete Your Profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isFaculty
              ? "Set up your faculty identity to start creating problems and contests."
              : "Your UID drives everything — roll number, division and batch are parsed straight from it."}
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[5fr,7fr]">
          <aside className="order-last lg:order-first">
            <div className="lg:sticky lg:top-24">
              {isFaculty ? (
                <FacultyPanel name={facultyName} designation={facultyDesignation} department={facultyDepartment} />
              ) : (
                <StudentUidPanel uid={studentUid} />
              )}
            </div>
          </aside>

          <section>
            {isFaculty ? (
              <Form {...facultyForm}>
                <form
                  onSubmit={facultyForm.handleSubmit((values) =>
                    saveMutation.mutate({
                      name: values.name.trim(),
                      designation: values.designation.trim(),
                      department: values.department,
                      linkedInUrl: toNullableUrl(values.linkedInUrl),
                      githubUrl: toNullableUrl(values.githubUrl),
                    }),
                  )}
                  className="space-y-6"
                >
                  <FormField
                    control={facultyForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={facultyForm.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {DEPARTMENTS.map((department) => (
                                <SelectItem key={department} value={department}>
                                  {department}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={facultyForm.control}
                      name="designation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Designation</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select designation" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {DESIGNATIONS.map((designation) => (
                                <SelectItem key={designation} value={designation}>
                                  {designation}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={facultyForm.control}
                      name="linkedInUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>LinkedIn URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://www.linkedin.com/in/your-profile" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={facultyForm.control}
                      name="githubUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GitHub URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://github.com/your-username" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 md:w-auto md:px-10"
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? "Saving..." : "Save & Continue"}
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...studentForm}>
                <form
                  onSubmit={studentForm.handleSubmit((values) => {
                    const parsed = parseUid(values.uid);
                    if (!parsed) {
                      studentForm.setError("uid", { message: "Invalid UID format, e.g. 24-AIDSA51-28" });
                      return;
                    }
                    const allowed = departmentsForUid(values.uid);
                    if (allowed.length > 0 && !allowed.includes(values.department)) {
                      studentForm.setError("department", {
                        message: "This department does not match your UID branch.",
                      });
                      return;
                    }
                    saveMutation.mutate({
                      name: values.name.trim(),
                      uid: values.uid.trim().toUpperCase(),
                      rollNumber: String(Number(parsed.rollNumber)),
                      department: values.department,
                      linkedInUrl: toNullableUrl(values.linkedInUrl),
                      githubUrl: toNullableUrl(values.githubUrl),
                    });
                  })}
                  className="space-y-6"
                >
                  <FormField
                    control={studentForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={studentForm.control}
                    name="uid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>UID</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="24-AIDSA51-28"
                            className="font-mono-code uppercase"
                            autoComplete="off"
                            spellCheck={false}
                            readOnly={uidLocked}
                            {...field}
                            onChange={(event) => {
                              if (uidLocked) return;
                              field.onChange(event.target.value.toUpperCase());
                            }}
                          />
                        </FormControl>
                        <FormDescription className="font-mono-code text-xs">
                          {uidLocked
                            ? "Provided by your institute account — it sets your department automatically."
                            : "admission_year-branch+div+rollno-passout_year — roll number is derived automatically."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={studentForm.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          {departmentIsSettled ? (
                            // The UID names exactly one department, so there is nothing to
                            // choose — showing a picker would only invite a wrong answer.
                            <>
                              <div className="flex h-10 items-center border border-border bg-muted/30 px-3 text-sm">
                                {field.value}
                              </div>
                              <FormDescription className="text-xs">
                                Read from your UID ({payloadUid}).
                              </FormDescription>
                            </>
                          ) : (
                            <>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select department" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {studentDepartmentOptions.map((department) => (
                                    <SelectItem key={department} value={department}>
                                      {department}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription className="text-xs">
                                {/* Only IOT reaches here: that branch covers two distinct
                                    programmes, and guessing between them would mis-scope the
                                    student's contests, class tests and department reporting. */}
                                {uidLocked
                                  ? "Your UID covers two programmes — pick the one you are in."
                                  : null}
                              </FormDescription>
                            </>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Semester is worked out from your UID and kept current automatically, so
                        there is nothing to pick and nothing to update each term. */}
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={studentForm.control}
                      name="linkedInUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>LinkedIn URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://www.linkedin.com/in/your-profile" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={studentForm.control}
                      name="githubUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GitHub URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://github.com/your-username" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 md:w-auto md:px-10"
                    disabled={isStudentSaveDisabled}
                  >
                    {saveMutation.isPending ? "Saving..." : "Save & Continue"}
                  </Button>
                </form>
              </Form>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
