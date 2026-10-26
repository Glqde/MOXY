"""
tests/unit/test_input_validation.py
Request schemas reject input that used to be saved blank or crash the database.
"""
import pytest
from pydantic import ValidationError

from app.schemas.schemas import (
    ChatMessageCreate, GroupCreate, GroupUpdate, RecurrenceRuleCreate,
    TaskCreate, TaskUpdate, UserUpdateRequest,
)

DAILY = {"recurrence_type": "daily"}


class TestBlankText:

    def test_empty_group_name_rejected(self):
        with pytest.raises(ValidationError):
            GroupCreate(name="")

    @pytest.mark.parametrize("name", ["   ", "​​", " ﻿ "])
    def test_group_name_must_have_visible_text(self, name):
        with pytest.raises(ValidationError, match="Group name can't be empty"):
            GroupCreate(name=name)

    def test_names_are_trimmed(self):
        assert GroupCreate(name="  Flat 4  ").name == "Flat 4"
        assert TaskCreate(title="  Dishes ", recurrence=DAILY).title == "Dishes"

    @pytest.mark.parametrize("schema,field", [(GroupUpdate, "name"), (TaskUpdate, "title"), (UserUpdateRequest, "full_name")])
    @pytest.mark.parametrize("value", ["", "   ", None])
    def test_renaming_to_blank_or_null_is_rejected(self, schema, field, value):
        with pytest.raises(ValidationError):
            schema(**{field: value})

    def test_task_title_of_spaces_rejected(self):
        with pytest.raises(ValidationError, match="Title can't be empty"):
            TaskCreate(title="   ", recurrence=DAILY)

    def test_chat_message_of_zero_width_spaces_rejected(self):
        with pytest.raises(ValidationError, match="Message can't be empty"):
            ChatMessageCreate(body="​‍")


class TestPartialUpdates:

    def test_omitted_fields_stay_unset(self):
        assert GroupUpdate(description="new").model_dump(exclude_unset=True) == {"description": "new"}

    @pytest.mark.parametrize("field", ["icon", "color", "vacation_mode"])
    def test_required_group_columns_cant_be_nulled(self, field):
        with pytest.raises(ValidationError, match=f"{field} can't be null"):
            GroupUpdate(**{field: None})

    def test_nullable_fields_can_be_cleared(self):
        assert GroupUpdate(description=None).model_dump(exclude_unset=True) == {"description": None}
        assert TaskUpdate(category=None).model_dump(exclude_unset=True) == {"category": None}


class TestUsername:

    @pytest.mark.parametrize("username", ["bad name!", "a b c", "dr@ke"])
    def test_profile_update_rejects_bad_usernames(self, username):
        with pytest.raises(ValidationError, match="Username may only contain"):
            UserUpdateRequest(username=username)

    def test_profile_update_accepts_good_username(self):
        assert UserUpdateRequest(username="manit_05-x").username == "manit_05-x"


class TestNullBytes:

    def test_null_bytes_are_dropped_everywhere(self):
        assert ChatMessageCreate(body="hi\x00there").body == "hithere"
        task = TaskCreate(title="Dis\x00hes", tags=["a\x00b"], recurrence=DAILY)
        assert task.title == "Dishes" and task.tags == ["ab"]

    def test_only_null_bytes_counts_as_blank(self):
        with pytest.raises(ValidationError):
            ChatMessageCreate(body="\x00\x00")


class TestRecurrence:

    def test_custom_needs_a_cron(self):
        with pytest.raises(ValidationError, match="cron_expression required"):
            RecurrenceRuleCreate(recurrence_type="custom")

    def test_custom_cron_must_parse(self):
        with pytest.raises(ValidationError, match="isn't a valid cron"):
            RecurrenceRuleCreate(recurrence_type="custom", cron_expression="not a cron")

    def test_valid_custom_cron(self):
        assert RecurrenceRuleCreate(recurrence_type="custom", cron_expression="0 9 * * 1").cron_expression == "0 9 * * 1"

    def test_known_timezone_kept(self):
        assert RecurrenceRuleCreate(recurrence_type="daily", timezone="Asia/Kolkata").timezone == "Asia/Kolkata"

    def test_unknown_timezone_falls_back_to_utc(self):
        assert RecurrenceRuleCreate(recurrence_type="daily", timezone="Mars/Olympus_Mons").timezone == "UTC"

    def test_cooldown_has_a_ceiling(self):
        with pytest.raises(ValidationError):
            RecurrenceRuleCreate(recurrence_type="daily", cooldown_minutes=10**9)

    def test_tags_have_a_length_limit(self):
        with pytest.raises(ValidationError):
            TaskCreate(title="t", tags=["x" * 41], recurrence=DAILY)
