import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";

import { userApi } from "@/api/services";
import { DEPARTMENTS, type CompleteProfilePayload } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    .min(1, "UID is required")
    .refine((value) => !value.toLowerCase().includes("mock"), "Enter your real UID"),
  rollNumber: z.string().trim().min(1, "Roll number is required"),
  semester: z.coerce.number().int().min(1).max(8),
  linkedInUrl: optionalUrlSchema,
  githubUrl: optionalUrlSchema,
});

const facultyProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  department: z.enum(DEPARTMENTS),
  designation: z.string().trim().min(1, "Designation is required"),
  linkedInUrl: optionalUrlSchema,
  githubUrl: optionalUrlSchema,
});

type StudentProfileFormValues = z.infer<typeof studentProfileSchema>;
type FacultyProfileFormValues = z.infer<typeof facultyProfileSchema>;

function toNullableUrl(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
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

  const studentForm = useForm<StudentProfileFormValues>({
    resolver: zodResolver(studentProfileSchema),
    defaultValues: {
      name: userData?.user.name ?? "",
      uid: userData?.user.uid ?? "",
      rollNumber: userData?.user.rollNumber ?? "",
      department: userData?.user.department ?? undefined,
      semester: userData?.user.semester ?? 1,
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
    values: {
      name: userData?.user.name ?? "",
      uid: userData?.user.uid ?? "",
      rollNumber: userData?.user.rollNumber ?? "",
      department: userData?.user.department ?? undefined,
      semester: userData?.user.semester ?? 1,
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
  });

  const facultyForm = useForm<FacultyProfileFormValues>({
    resolver: zodResolver(facultyProfileSchema),
    defaultValues: {
      name: userData?.user.name ?? "",
      department: userData?.user.department ?? undefined,
      designation: userData?.user.designation ?? "",
      linkedInUrl: userData?.user.linkedInUrl ?? "",
      githubUrl: userData?.user.githubUrl ?? "",
    },
    values: {
      name: userData?.user.name ?? "",
      department: userData?.user.department ?? undefined,
      designation: userData?.user.designation ?? "",
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
  const studentRollNumber = studentForm.watch("rollNumber");
  const isStudentSaveDisabled =
    saveMutation.isPending || studentUid.trim().length === 0 || studentRollNumber.trim().length === 0;

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading your profile…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-2xl shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-3xl">Complete Your Profile</CardTitle>
        </CardHeader>
        <CardContent>
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
                className="space-y-5"
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

                <div className="grid gap-5 md:grid-cols-2">
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
                        <FormControl>
                          <Input placeholder="e.g. Assistant Professor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <Button
                  type="submit"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Saving..." : "Save & Continue"}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...studentForm}>
              <form
                onSubmit={studentForm.handleSubmit((values) =>
                  saveMutation.mutate({
                    name: values.name.trim(),
                    uid: values.uid.trim(),
                    rollNumber: values.rollNumber.trim(),
                    department: values.department,
                    semester: values.semester,
                    linkedInUrl: toNullableUrl(values.linkedInUrl),
                    githubUrl: toNullableUrl(values.githubUrl),
                  }),
                )}
                className="space-y-5"
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
                        <Input placeholder="e.g. TCET1234" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={studentForm.control}
                  name="rollNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roll Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your university roll number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    control={studentForm.control}
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
                    control={studentForm.control}
                    name="semester"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Semester</FormLabel>
                        <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select semester" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => (
                              <SelectItem key={semester} value={String(semester)}>
                                Semester {semester}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <Button
                  type="submit"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={isStudentSaveDisabled}
                >
                  {saveMutation.isPending ? "Saving..." : "Save & Continue"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
