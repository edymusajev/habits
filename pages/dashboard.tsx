import {
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePicker, Calendar, Month } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { useSupabaseClient, useUser } from "@supabase/auth-helpers-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Habit } from "../types/habit.types";
import { Database } from "../types/supabase";
import dayjs from "dayjs";

const HabitCard = ({ habit }: { habit: Habit }) => {
  const supa = useSupabaseClient<Database>();
  const queryClient = useQueryClient();
  const [calendarValue, setCalendarValue] = useState<Date[]>([]);

  const { data: completedDates } = useQuery(
    ["completedDates", habit.id],
    async () => {
      const { data, error } = await supa
        .from("habit_completions")
        .select("completed_at")
        .eq("habit_id", habit.id);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    }
  );

  useEffect(() => {
    completedDates &&
      setCalendarValue(
        completedDates.map((date) => new Date(date.completed_at))
      );
  }, [completedDates]);

  const completedToday = completedDates?.some((date) => {
    const completedAt = new Date(date.completed_at);
    const today = new Date();
    return (
      completedAt.getDate() === today.getDate() &&
      completedAt.getMonth() === today.getMonth() &&
      completedAt.getFullYear() === today.getFullYear()
    );
  });

  const { mutate: completeHabit } = useMutation(
    async (date: Date) => {
      if (
        completedDates
          ?.map((date) => date.completed_at)
          .includes(dayjs(date).format("YYYY-MM-DD"))
      ) {
        console.log("deleting");
        await supa
          .from("habit_completions")
          .delete()
          .match({
            user_id: habit.user_id,
            habit_id: habit.id,
            completed_at: dayjs(date).format("YYYY-MM-DD"),
          });
      } else {
        await supa.from("habit_completions").insert({
          habit_id: habit.id,
          completed_at: dayjs(date).format("YYYY-MM-DD"),
          user_id: habit.user_id,
        });
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["completedDates", habit.id]);
      },
    }
  );

  const { mutate: deleteTodo } = useMutation(
    async () => {
      await supa.from("habits").delete().eq("id", habit.id);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries("habits");
      },
    }
  );

  const handleDelete = async () => {
    deleteTodo();
  };
  return (
    <Card withBorder>
      <Group position="apart">
        <Text>{habit.title}</Text>

        <Group>
          <Button
            color={completedToday ? "green" : "blue"}
            onClick={() => completeHabit(new Date())}
          >
            {completedToday ? "Completed" : "Complete"}
          </Button>
          <Button onClick={handleDelete} color="red">
            Delete
          </Button>
        </Group>
      </Group>
      <Calendar
        multiple
        value={calendarValue}
        onChange={(selectedDates) => {
          const isUnselecting = calendarValue.length > selectedDates.length;
          let unselectedDate: Date | undefined;

          function difference(arr1: Date[], arr2: Date[]) {
            return arr1.filter((x) => !arr2.includes(x));
          }

          if (isUnselecting) {
            unselectedDate = difference(
              [...calendarValue].sort(),
              [...selectedDates].sort()
            ).shift();
            console.log("unselectedDate", unselectedDate);
            unselectedDate && completeHabit(unselectedDate);
            const newDates = calendarValue.filter(
              (date) => date !== unselectedDate
            );
            setCalendarValue(newDates);
            return;
          }

          const lastSelectedDate = selectedDates.at(-1);

          if (
            lastSelectedDate &&
            !completedDates
              ?.map((date) => date.completed_at)
              .includes(lastSelectedDate.toISOString())
          ) {
            completeHabit(lastSelectedDate);
            setCalendarValue([...calendarValue, lastSelectedDate]);
          }
        }}
      />
    </Card>
  );
};

const CreateHabitButton = () => {
  const supa = useSupabaseClient<Database>();
  const user = useUser();
  const [opened, setOpened] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      title: "",
    },
  });

  const { mutate: createHabit } = useMutation(
    async (values: any) =>
      user &&
      (await supa.from("habits").insert({
        title: values.title,
        user_id: user.id,
      })),
    {
      onSuccess: () => {
        queryClient.invalidateQueries("habits");
      },
    }
  );

  const handleSubmit = async (values: any) => {
    createHabit(values);

    setOpened(false);
  };
  return (
    <>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Create New Habit"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput {...form.getInputProps("title")} />
            <Button type="submit">Add</Button>
          </Stack>
        </form>
      </Modal>
      <Button onClick={() => setOpened(true)}>Create Habit</Button>
    </>
  );
};

export default function Dashboard() {
  const supa = useSupabaseClient<Database>();

  const { data: habits } = useQuery("habits", async () => {
    const {
      data: { user },
    } = await supa.auth.getUser();
    console.log(user);
    const { data, error } = await supa
      .from("habits")
      .select("*")
      .eq("user_id", user?.id);

    return data;
  });

  return (
    <>
      <Container>
        <Title>Habits</Title>
        <CreateHabitButton />
        {/* <SimpleGrid cols={4}> */}
        {habits?.map((habit) => (
          <HabitCard habit={habit} key={habit.id} />
        ))}
        {/* </SimpleGrid> */}
      </Container>
    </>
  );
}
