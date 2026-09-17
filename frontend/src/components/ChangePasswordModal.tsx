/**
 * ChangePasswordModal — modal dialog for changing the admin password.
 *
 * Requires old password verification before setting a new one.
 */

import { useState } from "react";
import { Modal, Form, Input, App as AntdApp } from "antd";
import { authApi } from "../services/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await authApi.changePassword(values.old_password, values.new_password);
      message.success("密码修改成功，下次登录请使用新密码");
      form.resetFields();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) {
        // form validation error, don't show toast
        return;
      }
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data
              ?.detail
          : undefined;
      message.error(detail || "密码修改失败，请检查原密码是否正确");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确认修改"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" autoComplete="off" style={{ marginTop: 16 }}>
        <Form.Item
          name="old_password"
          label="原密码"
          rules={[{ required: true, message: "请输入原密码" }]}
        >
          <Input.Password placeholder="当前密码" />
        </Form.Item>

        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 6, message: "新密码至少 6 个字符" },
          ]}
        >
          <Input.Password placeholder="新密码（至少 6 个字符）" />
        </Form.Item>

        <Form.Item
          name="confirm_password"
          label="确认新密码"
          dependencies={["new_password"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("new_password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("两次输入的密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入新密码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
