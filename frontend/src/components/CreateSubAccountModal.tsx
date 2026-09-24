/**
 * CreateSubAccountModal — admin-only modal for creating sub-accounts.
 */

import { useState } from "react";
import { Modal, Form, Input, App as AntdApp } from "antd";
import { authApi } from "../services/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateSubAccountModal({ open, onClose }: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await authApi.createUser(values.username, values.password);
      message.success(`子账号 ${values.username} 创建成功`);
      form.resetFields();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) {
        return;
      }
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      message.error(detail || "创建失败");
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
      title="创建子账号"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" autoComplete="off" style={{ marginTop: 16 }}>
        <Form.Item
          name="username"
          label="用户名"
          rules={[
            { required: true, message: "请输入用户名" },
            { min: 3, max: 20, message: "用户名需要 3-20 个字符" },
          ]}
        >
          <Input placeholder="子账号用户名" />
        </Form.Item>

        <Form.Item
          name="password"
          label="密码"
          rules={[
            { required: true, message: "请输入密码" },
            { min: 6, message: "密码至少 6 个字符" },
          ]}
        >
          <Input.Password placeholder="子账号密码（至少 6 个字符）" />
        </Form.Item>

        <Form.Item
          name="confirm_password"
          label="确认密码"
          dependencies={["password"]}
          rules={[
            { required: true, message: "请再次输入密码" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("两次输入的密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入密码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
