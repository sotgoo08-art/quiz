CREATE DATABASE IF NOT EXISTS quiz_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE quiz_db;
CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_index TINYINT NOT NULL
);
INSERT INTO questions (question, option_a, option_b, option_c, option_d, correct_index) VALUES
('Хоёртын системд 101 тоо аравтын системд хэд вэ?', '3', '5', '6', '7', 1),
('Хоёртын системд 1010 тоо аравтын системд хэд вэ?', '8', '10', '12', '14', 1),
('Аравтын системийн 8 тоо хоёртын системд юу вэ?', '0100', '1000', '1001', '1100', 1),
('1 байт хэдэн бит вэ?', '4', '8', '16', '32', 1),
('Хоёртын системд 1111 тоо аравтын системд хэд вэ?', '12', '13', '14', '15', 3),
('Хоёртын системд ямар цифрүүд ашигладаг вэ?', '0 ба 1', '0-ээс 9', '1 ба 2', '0-ээс 7', 0),
('Аравтын системийн 5 тоо хоёртын системд юу вэ?', '100', '101', '110', '111', 1),
('2-ын 4-р зэрэг хэд вэ?', '8', '12', '16', '32', 2),
('Хоёртын системд 110 тоо аравтын системд хэд вэ?', '4', '5', '6', '7', 2);